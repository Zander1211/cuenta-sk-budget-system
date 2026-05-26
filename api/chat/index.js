import { createClient } from '@supabase/supabase-js'
import pdfParse from 'pdf-parse'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed')
    return
  }

  const { messages, reportId } = req.body || {}
  if (!messages) {
    res.status(400).json({ error: 'Missing messages in request body' })
    return
  }

  const OPENAI_API_KEY = process.env.OPENAI_API_KEY
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://imxwgkwlxjqadwigjuxz.supabase.co'
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY

  if (!OPENAI_API_KEY) {
    res.status(500).json({ error: 'OPENAI_API_KEY is not configured on the server' })
    return
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

  // If reportId supplied, fetch the report file and extract text
  let reportText = null
  if (reportId) {
    try {
      const { data: rows, error: selectError } = await supabaseAdmin
        .from('liquidation_reports')
        .select('id, title, file_name, file_path')
        .eq('id', reportId)
        .limit(1)
        .single()

      if (selectError) {
        throw selectError
      }

      const filePath = rows.file_path
      const bucket = 'liquidation-reports'
      const { data: downloadData, error: downloadError } = await supabaseAdmin.storage
        .from(bucket)
        .download(filePath)

      if (downloadError) {
        throw downloadError
      }

      const arrayBuffer = await downloadData.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      if (rows.file_name?.toLowerCase().endsWith('.pdf')) {
        const parsed = await pdfParse(buffer)
        reportText = parsed.text || ''
      } else {
        reportText = buffer.toString('utf8')
      }

      // truncate to a safe size for the model
      if (reportText && reportText.length > 25000) {
        reportText = reportText.slice(0, 25000)
      }
    } catch (err) {
      console.error('Report fetch/parse error', err)
      res.status(500).json({ error: 'Failed to fetch or parse report: ' + (err.message || err) })
      return
    }
  }

  // If we have reportText, prepend instructions and the report content (truncated)
  // Use model specified or default to gpt-4 for higher-quality summaries
  const MODEL = process.env.OPENAI_MODEL || 'gpt-4'

  // Helper to call OpenAI
  async function callOpenAI(messagesPayload) {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({ model: MODEL, messages: messagesPayload }),
    })

    if (!resp.ok) {
      const text = await resp.text()
      throw new Error(text || `OpenAI request failed with status ${resp.status}`)
    }

    const data = await resp.json()
    return data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
  }

  try {
    if (reportText && reportText.length > 16000) {
      // Chunk the report and summarize each chunk, then synthesize
      const CHUNK_SIZE = 8000
      const chunks = []
      for (let i = 0; i < reportText.length; i += CHUNK_SIZE) {
        chunks.push(reportText.slice(i, i + CHUNK_SIZE))
      }

      const chunkSummaries = []
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]
        const prompt = [
          {
            role: 'system',
            content:
              'You are a helpful assistant that extracts concise summaries and key figures from report text. Provide 4–6 bullet points per chunk and include any numeric figures or dates you see.',
          },
          { role: 'user', content: `Chunk ${i + 1} of ${chunks.length}:\n\n${chunk}` },
        ]

        const summary = await callOpenAI(prompt)
        chunkSummaries.push(`Chunk ${i + 1} summary:\n${summary}`)
      }

      // Synthesize chunk summaries into final executive summary
      const synthPrompt = [
        {
          role: 'system',
          content:
            'You are an assistant specialized in summarizing liquidation and financial reports. Produce a concise executive summary (3-6 bullets), list key figures and important dates, and then answer follow-up questions clearly and concisely.',
        },
        { role: 'user', content: `Here are the chunk summaries:\n\n${chunkSummaries.join('\n\n')}` },
        { role: 'user', content: 'Synthesize the above into a single executive summary and list key figures/dates.' },
        ...messages,
      ]

      const finalReply = await callOpenAI(synthPrompt)
      res.json({ reply: finalReply })
      return
    }

    // For short reports or no report provided, do single-shot query
    const finalMessages = reportText
      ? [
          {
            role: 'system',
            content:
              'You are an assistant specialized in summarizing liquidation and financial reports. For any summary request, first produce a concise executive summary (3-6 bullets), then list any key figures or important dates, and finally answer follow-up questions clearly and concisely.',
          },
          { role: 'system', content: `Report content (truncated):\n\n${reportText}` },
          ...messages,
        ]
      : messages

    const reply = await callOpenAI(finalMessages)
    res.json({ reply })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message || String(err) })
  }
}
