import { createReadStream } from 'fs'
import { promises as fsp } from 'fs'
import path from 'path'
import { Readable } from 'node:stream'
import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/session'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function readInstallerOutputDir(): Promise<string> {
  const pkgPath = path.join(process.cwd(), 'agent', 'package.json')
  const raw = await fsp.readFile(pkgPath, 'utf8')
  const pkg = JSON.parse(raw) as { build?: { directories?: { output?: string } } }
  const out = pkg.build?.directories?.output?.trim()
  return out && out.length > 0 ? out : 'installer-release-v8'
}

async function findNewestExe(installDir: string): Promise<string | null> {
  let names: string[]
  try {
    names = await fsp.readdir(installDir)
  } catch {
    return null
  }
  const exes = names.filter((n) => n.toLowerCase().endsWith('.exe'))
  if (exes.length === 0) return null

  let bestPath: string | null = null
  let bestTime = 0
  for (const n of exes) {
    const fp = path.join(installDir, n)
    try {
      const st = await fsp.stat(fp)
      if (!st.isFile()) continue
      if (st.mtimeMs >= bestTime) {
        bestTime = st.mtimeMs
        bestPath = fp
      }
    } catch {
      continue
    }
  }
  return bestPath
}

/**
 * GET /api/attendance/windows-agent/installer
 * Serves the newest NSIS .exe from agent/{build.directories.output}/ when built locally,
 * or redirects to WINDOWS_AGENT_INSTALLER_URL when set (e.g. GitHub Release asset).
 */
export async function GET(request: NextRequest) {
  const session = await getSessionFromRequest(request)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const fromEnv = process.env.WINDOWS_AGENT_INSTALLER_URL?.trim()
  if (fromEnv) {
    return NextResponse.redirect(fromEnv, 302)
  }

  try {
    const outDirName = await readInstallerOutputDir()
    const installDir = path.resolve(process.cwd(), 'agent', outDirName)
    const exePath = await findNewestExe(installDir)
    if (!exePath) {
      return NextResponse.json(
        {
          error: 'No Windows Agent installer found on this server.',
          hint:
            'Build the agent on this machine (see Attendance → Windows Agent), or set WINDOWS_AGENT_INSTALLER_URL to a hosted .exe link for cloud deployments.'
        },
        { status: 404 }
      )
    }

    const resolvedExe = path.resolve(exePath)
    const rel = path.relative(installDir, resolvedExe)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      return NextResponse.json({ error: 'Invalid installer path' }, { status: 500 })
    }

    const baseName = path.basename(resolvedExe)
    const stream = createReadStream(resolvedExe)
    const webStream = Readable.toWeb(stream) as unknown as ReadableStream

    return new NextResponse(webStream, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${baseName.replace(/"/g, '')}"`
      }
    })
  } catch (e) {
    console.error('[windows-agent-installer]', e)
    return NextResponse.json(
      {
        error: 'Could not read the Windows Agent installer.',
        hint: 'Ensure this app runs from the Shift Close project root and agent/package.json exists.'
      },
      { status: 500 }
    )
  }
}
