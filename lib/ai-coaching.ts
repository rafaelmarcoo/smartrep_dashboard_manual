type CoachingKind = "set" | "session";

type CoachingInput = {
  kind: CoachingKind;
  exercise: string;
  sets?: number | null;
  reps?: number | null;
  repsPerSet?: unknown;
  badReps?: number | null;
  formScore?: number | null;
  angleData?: unknown;
};

function fallbackCoaching(input: CoachingInput) {
  const scoreText =
    typeof input.formScore === "number" ? ` Your form score was ${input.formScore}/100.` : "";

  if (input.kind === "set") {
    return `Set complete.${scoreText} Keep the movement controlled and focus on consistent range of motion before the next set.`;
  }

  return `Workout complete.${scoreText} You finished the session with useful rep data captured for review. Keep using the set feedback to adjust your next workout.`;
}

function extractOutputText(payload: unknown) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "output_text" in payload &&
    typeof payload.output_text === "string"
  ) {
    return payload.output_text;
  }

  return null;
}

export async function generateWorkoutCoaching(input: CoachingInput) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL ?? "gpt-5.2";

  if (!apiKey) {
    return fallbackCoaching(input);
  }

  const prompt =
    input.kind === "set"
      ? `Exercise: ${input.exercise}
Set reps: ${input.reps ?? "not captured"}
Bad reps: ${input.badReps ?? "not captured"}
Form score: ${input.formScore ?? "not captured"}
Per-rep angle summary: ${JSON.stringify(input.angleData ?? [])}

Give 2 concise sentences of set feedback the user can apply before the next set.`
      : `Exercise: ${input.exercise}
Sets: ${input.sets ?? "not captured"}
Reps per set: ${JSON.stringify(input.repsPerSet ?? [])}
Bad reps: ${input.badReps ?? "not captured"}
Form score: ${input.formScore ?? "not captured"}

Give 3 concise sentences summarizing the workout, range of motion, consistency, and one improvement tip.`;

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions:
        "You are a supportive gym coach. Be concise, specific, and encouraging. Do not mention that you are an AI.",
      input: prompt,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`OpenAI coaching failed: ${res.status} ${text}`);
    return fallbackCoaching(input);
  }

  const payload = (await res.json()) as unknown;
  return extractOutputText(payload) ?? fallbackCoaching(input);
}
