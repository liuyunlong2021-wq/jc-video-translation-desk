import fs from 'node:fs/promises'
import path from 'node:path'
import { app, BrowserWindow } from 'electron'
import { capturePinterestReference } from './pinterest-reference.ts'

app.on('window-all-closed', () => {})

app.whenReady().then(async () => {
  try {
    const query = process.argv[2] || 'cinematic anxious office worker character reference'
    const outputPath = path.resolve(process.argv[3] || 'reference-search-audit.png')
    const result = await capturePinterestReference(query)
    await fs.writeFile(outputPath, result.png)
    await new Promise((resolve) => setTimeout(resolve, 800))
    if (BrowserWindow.getAllWindows().length) throw new Error('Pinterest 搜索窗口未自动关闭')
    process.stdout.write(JSON.stringify({ query, outputPath, ...result, png: undefined }, null, 2) + '\n')
    app.quit()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    app.exit(1)
  }
})
