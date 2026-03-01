import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { join, resolve } from 'path'
import { spawn, ChildProcess } from 'child_process'
import { createServer } from 'net'
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs'

const isDev = !app.isPackaged

let backendProcess: ChildProcess | null = null
let backendPort = 8765

function loadDefaultKeys(): Record<string, string> {
  const candidates = isDev
    ? [join(__dirname, '../../default-keys.json')]
    : [
        join(process.resourcesPath, 'default-keys.json'),
        join(__dirname, '../default-keys.json'),
      ]
  for (const p of candidates) {
    if (existsSync(p)) {
      try {
        return JSON.parse(readFileSync(p, 'utf-8'))
      } catch { /* ignore bad JSON */ }
    }
  }
  return {}
}

const DEFAULT_KEYS: Record<string, string> = loadDefaultKeys()

function getConfigPath(): string {
  return join(app.getPath('userData'), 'nearu-config.json')
}

function loadUserConfig(): Record<string, string> {
  const p = getConfigPath()
  if (existsSync(p)) {
    try {
      return JSON.parse(readFileSync(p, 'utf-8'))
    } catch {
      return {}
    }
  }
  return {}
}

function loadConfig(): Record<string, string> {
  const user = loadUserConfig()
  return {
    ...DEFAULT_KEYS,
    ...Object.fromEntries(Object.entries(user).filter(([, v]) => v)),
  }
}

function saveConfig(cfg: Record<string, string>): void {
  writeFileSync(getConfigPath(), JSON.stringify(cfg, null, 2), 'utf-8')
}

function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      srv.close(() => resolve(port))
    })
    srv.on('error', reject)
  })
}

function getBackendPath(): string {
  if (isDev) {
    return ''
  }
  const ext = process.platform === 'win32' ? '.exe' : ''
  return join(process.resourcesPath, 'orchestrator', `nearu-orchestrator${ext}`)
}

async function waitForHealth(port: number, timeoutMs = 60000): Promise<boolean> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/health`)
      if (resp.ok) return true
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500))
  }
  return false
}

function getDataDir(): string {
  const dir = join(app.getPath('userData'), 'orchestrator-data')
  mkdirSync(dir, { recursive: true })
  return dir
}

function logToFile(msg: string): void {
  try {
    const logPath = join(getDataDir(), 'backend.log')
    appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`)
  } catch { /* best-effort */ }
}

async function startBackend(config: Record<string, string>): Promise<void> {
  if (isDev) return

  const binPath = getBackendPath()
  if (!existsSync(binPath)) {
    const msg = `Binary not found: ${binPath}`
    console.error('[backend]', msg)
    logToFile(msg)
    return
  }

  backendPort = await findFreePort()
  const dataDir = getDataDir()

  const env: Record<string, string> = {
    ...process.env as Record<string, string>,
    PORT: String(backendPort),
    HOST: '127.0.0.1',
    NEARU_DATA_DIR: dataDir,
  }

  if (config.OPENAI_API_KEY) env.OPENAI_API_KEY = config.OPENAI_API_KEY
  if (config.GEMINI_API_KEY) env.GEMINI_API_KEY = config.GEMINI_API_KEY

  console.log(`[backend] Starting on port ${backendPort}, data dir: ${dataDir}`)
  logToFile(`Starting on port ${backendPort}, binary: ${binPath}, cwd: ${dataDir}`)

  backendProcess = spawn(binPath, [], {
    env,
    cwd: dataDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  backendProcess.stdout?.on('data', (d: Buffer) => {
    const line = d.toString().trim()
    console.log('[backend]', line)
    logToFile(`[stdout] ${line}`)
  })
  backendProcess.stderr?.on('data', (d: Buffer) => {
    const line = d.toString().trim()
    console.error('[backend]', line)
    logToFile(`[stderr] ${line}`)
  })
  backendProcess.on('error', (err) => {
    const msg = `Spawn error: ${err.message}`
    console.error('[backend]', msg)
    logToFile(msg)
    backendProcess = null
  })
  backendProcess.on('exit', (code) => {
    const msg = `Exited with code ${code}`
    console.log('[backend]', msg)
    logToFile(msg)
    backendProcess = null
  })

  const ready = await waitForHealth(backendPort)
  if (!ready) {
    console.error('[backend] Health check timed out')
    logToFile('Health check timed out after 60s')
  } else {
    console.log('[backend] Ready')
    logToFile('Health check passed — ready')
  }
}

function killBackend(): void {
  if (!backendProcess) return
  console.log('[backend] Shutting down')

  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(backendProcess.pid), '/f', '/t'], {
      windowsHide: true,
    })
  } else {
    backendProcess.kill('SIGTERM')
  }
  backendProcess = null
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0B0D14',
    icon: isDev
      ? join(__dirname, '../../public/nearuai_icon.jpg')
      : join(__dirname, '../renderer/nearuai_icon.jpg'),
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

ipcMain.handle('get-ws-port', () => backendPort)
ipcMain.handle('get-is-dev', () => isDev)

ipcMain.handle('get-api-keys', () => {
  const effective = loadConfig()
  const user = loadUserConfig()
  return {
    openai: effective.OPENAI_API_KEY || '',
    gemini: effective.GEMINI_API_KEY || '',
    hasDefaults: Boolean(DEFAULT_KEYS.OPENAI_API_KEY && DEFAULT_KEYS.GEMINI_API_KEY),
    isCustomOpenai: Boolean(user.OPENAI_API_KEY),
    isCustomGemini: Boolean(user.GEMINI_API_KEY),
  }
})

ipcMain.handle('save-api-keys', async (_event, keys: { openai: string; gemini: string }) => {
  const user = loadUserConfig()
  if (keys.openai) user.OPENAI_API_KEY = keys.openai
  else delete user.OPENAI_API_KEY
  if (keys.gemini) user.GEMINI_API_KEY = keys.gemini
  else delete user.GEMINI_API_KEY
  saveConfig(user)

  killBackend()
  await startBackend(loadConfig())

  return { success: true, port: backendPort }
})

app.whenReady().then(async () => {
  const config = loadConfig()
  await startBackend(config)
  createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (!backendProcess) {
        await startBackend(loadConfig())
      }
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  killBackend()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    killBackend()
    app.quit()
  }
})
