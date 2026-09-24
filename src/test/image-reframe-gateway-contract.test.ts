import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = readFileSync(resolve(__dirname, '../../supabase/functions/image-reframe/index.ts'), 'utf8')

describe('image-reframe AI gateway contract', () => {
  it('sends the aspect ratio via image_config', () => {
    expect(source).toMatch(/image_config:\s*\{\s*aspect_ratio:\s*ratio\s*\}/)
  })

  it('does not send unsupported response format aliases', () => {
    expect(source).not.toMatch(/\bresponseFormat\b/)
    expect(source).not.toMatch(/\bresponse_format\b/)
  })
})
