import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../middleware/auth.ts';
import { validateBody, voiceSpeakSchema } from '../middleware/validation.ts';
import { config } from '../config.ts';
import { createLogger } from '../logger.ts';
import multer from 'multer';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';

const log = createLogger('route:voice');
export const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.post('/transcribe', authMiddleware, upload.single('audio'), async (req: Request, res: Response) => {
    try {
        const file = (req as unknown as { file: Express.Multer.File }).file;
        if (!file) return res.status(400).json({ success: false, error: 'No audio file uploaded' });
        const openaiKey = config.OPENAI_API_KEY ?? config.OPENROUTER_API_KEY;
        if (!openaiKey) return res.status(503).json({ success: false, error: 'No OpenAI API key' });
        const tmpPath = `${tmpdir()}/gc_audio_${Date.now()}.webm`;
        await writeFile(tmpPath, file.buffer);
        const { transcribeAudio } = await import('../voice/transcription.ts');
        const text = await transcribeAudio(tmpPath, openaiKey);
        await unlink(tmpPath).catch(() => {});
        res.json({ success: true, text });
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: message });
    }
});

router.post('/speak', authMiddleware, validateBody(voiceSpeakSchema), async (req, res) => {
    try {
        const { text, voice = 'alloy' } = req.body;
        const openaiKey = config.OPENAI_API_KEY ?? config.OPENROUTER_API_KEY;
        if (!openaiKey) return res.status(503).json({ success: false, error: 'No OpenAI API key' });
        const { TTSService } = await import('../voice/tts.ts');
        const tts = new TTSService(openaiKey, 'tts-1', voice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer");
        const audioBuffer = await tts.textToSpeech(text.substring(0, 4096));
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Content-Length', audioBuffer.length);
        res.send(audioBuffer);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        res.status(500).json({ success: false, error: message });
    }
});