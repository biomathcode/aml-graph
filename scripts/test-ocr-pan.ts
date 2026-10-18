import fs from 'node:fs'
import Tesseract from 'tesseract.js'

async function main() {
  const imagePath = '/Users/coolhead/.gemini/antigravity-ide/brain/41463db6-bcda-451d-bf8a-a98a5d1ed713/.user_uploaded/media_1792175861975.png'
  
  if (!fs.existsSync(imagePath)) {
    console.error('Image not found:', imagePath)
    process.exit(1)
  }

  const buffer = fs.readFileSync(imagePath)
  console.log(`Loaded image (${buffer.length} bytes). Running OCR...`)
  
  const startTime = Date.now()
  const { data } = await Tesseract.recognize(buffer, 'eng', {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        process.stdout.write(`\rProgress: ${Math.round((m.progress || 0) * 100)}%`)
      }
    }
  })
  const durationMs = Date.now() - startTime
  console.log(`\n\nOCR Finished in ${durationMs}ms\n`)
  console.log('--- RAW EXTRACTED TEXT ---')
  console.log(data.text)
  console.log('--------------------------')
}

main().catch(console.error)
