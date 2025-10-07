import type { DataPart } from '../../messages/data-parts'
import type { File } from './get-contents'
import type { UIMessageStreamWriter, UIMessage } from 'ai'
import { getRichError } from '../get-rich-error'

interface Params {
  // E2B Sandbox instance
  sandbox: {
    runCode: (code: string, opts?: { language?: string }) => Promise<unknown>
  }
  toolCallId: string
  writer: UIMessageStreamWriter<UIMessage<never, DataPart>>
}

export function getWriteFiles({ sandbox, toolCallId, writer }: Params) {
  return async function writeFiles(params: {
    written: string[]
    files: File[]
    paths: string[]
  }) {
    const paths = params.written.concat(params.files.map((file) => file.path))
    writer.write({
      id: toolCallId,
      type: 'data-generating-files',
      data: { paths, status: 'uploading' },
    })

    try {
      // Build a single Python script to write multiple files efficiently
      const payload = params.files.map((file) => ({
        path: file.path,
        b64: Buffer.from(file.content, 'utf8').toString('base64'),
      }))
      const py = `
import os, base64
files = ${JSON.stringify(payload)}
for f in files:
  p = f["path"]
  d = os.path.dirname(p)
  if d:
    os.makedirs(d, exist_ok=True)
  with open(p, "wb") as out:
    out.write(base64.b64decode(f["b64"]))
print("written:" + ",".join([f["path"] for f in files]))
`.trim()

      await sandbox.runCode(py, { language: 'python' })
    } catch (error) {
      const richError = getRichError({
        action: 'write files to sandbox',
        args: { paths: params.paths },
        error,
      })

      writer.write({
        id: toolCallId,
        type: 'data-generating-files',
        data: {
          error: richError.error,
          status: 'error',
          paths: params.paths,
        },
      })

      return richError.message
    }

    writer.write({
      id: toolCallId,
      type: 'data-generating-files',
      data: { paths, status: 'uploaded' },
    })
  }
}
