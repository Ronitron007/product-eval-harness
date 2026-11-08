// A blank reviewer and a blank note pass PersonDecision of the spec (stage.types).
import { z } from 'zod'
const PersonDecision = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('accept'), reviewer: z.string().min(1), note: z.string().optional() }).strict(),
  z.object({ decision: z.literal('reject'), reviewer: z.string().min(1), note: z.string().min(1) }).strict(),
])
console.log('P15 reject with reviewer and note of one space ->', PersonDecision.safeParse({ decision: 'reject', reviewer: ' ', note: ' ' }).success ? 'accepted' : 'refused')
