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

function getEnvValue(name: string) {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };

  return runtime.process?.env?.[name];
}

function formatExerciseName(exercise: string) {
  return exercise.replaceAll("_", " ");
}

function getRepSummaries(angleData: unknown) {
  if (!Array.isArray(angleData)) {
    return [];
  }

  return angleData.filter(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null
  );
}

function getIssueCounts(reps: Record<string, unknown>[]) {
  const issueCounts = new Map<string, number>();

  for (const rep of reps) {
    const issues = Array.isArray(rep.issues) ? rep.issues : [];
    for (const issue of issues) {
      if (typeof issue !== "string") continue;
      issueCounts.set(issue, (issueCounts.get(issue) ?? 0) + 1);
    }
  }

  return [...issueCounts.entries()].sort((a, b) => b[1] - a[1]);
}

function getNumber(rep: Record<string, unknown>, key: string) {
  const value = rep[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isNumber(value: number | null): value is number {
  return value !== null;
}

function getRangeComment(input: CoachingInput, reps: Record<string, unknown>[]) {
  if (reps.length === 0) {
    return "No detailed rep angles were captured, so keep the next set smooth and repeatable.";
  }

  const mins = reps.map((rep) => getNumber(rep, "min_angle")).filter(isNumber);
  const maxes = reps.map((rep) => getNumber(rep, "max_angle")).filter(isNumber);
  const averageMin = mins.reduce((sum, value) => sum + value, 0) / Math.max(mins.length, 1);
  const averageMax = maxes.reduce((sum, value) => sum + value, 0) / Math.max(maxes.length, 1);

  if (input.exercise === "squat") {
    if (averageMin > 105) return "Your squat reps look a little shallow, so aim for more depth next set.";
    if (averageMax < 145) return "Stand taller between squat reps so each rep resets cleanly.";
    return "Squat depth and reset height were consistent across the captured reps.";
  }

  if (input.exercise === "bicep_curl") {
    if (averageMin > 70) return "Curl a bit higher at the top so the contraction is clearer.";
    if (averageMax < 140) return "Let the arm extend more at the bottom before starting the next curl.";
    return "Curl range of motion was solid across the captured reps.";
  }

  return `The captured ${formatExerciseName(input.exercise)} range of motion looked steady.`;
}

function fallbackCoaching(input: CoachingInput) {
  const scoreText =
    typeof input.formScore === "number" ? ` Your form score was ${input.formScore}/100.` : "";

  if (input.kind === "set") {
    const reps = getRepSummaries(input.angleData);
    const issueCounts = getIssueCounts(reps);
    const topIssue = issueCounts[0];
    const issueText = topIssue
      ? ` Main form flag: ${topIssue[0]} on ${topIssue[1]} rep${topIssue[1] === 1 ? "" : "s"}.`
      : "";

    return `Set complete.${scoreText} ${getRangeComment(input, reps)}${issueText}`;
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

  if (
    typeof payload === "object" &&
    payload !== null &&
    "output" in payload &&
    Array.isArray(payload.output)
  ) {
    for (const item of payload.output) {
      if (
        typeof item === "object" &&
        item !== null &&
        "content" in item &&
        Array.isArray(item.content)
      ) {
        for (const content of item.content) {
          if (
            typeof content === "object" &&
            content !== null &&
            "text" in content &&
            typeof content.text === "string"
          ) {
            return content.text;
          }
        }
      }
    }
  }

  return null;
}

export async function generateWorkoutCoaching(input: CoachingInput) {
  const apiKey = getEnvValue("OPENAI_API_KEY");
  const model = getEnvValue("OPENAI_MODEL") ?? "gpt-5.2";

  if (!apiKey) {
    console.warn("OpenAI coaching skipped: OPENAI_API_KEY is not set.");
    return fallbackCoaching(input);
  }

  const reps = getRepSummaries(input.angleData);
  const issueCounts = getIssueCounts(reps);
  const issueSummary =
    issueCounts.length > 0
      ? issueCounts.map(([issue, count]) => `${issue}: ${count}`).join(", ")
      : "none";

  const prompt =
    input.kind === "set"
      ? `Exercise: ${input.exercise}
Set reps: ${input.reps ?? "not captured"}
Bad reps: ${input.badReps ?? "not captured"}
Form score: ${input.formScore ?? "not captured"}
Per-rep angle summary: ${JSON.stringify(input.angleData ?? [])}
Detected issue counts: ${issueSummary}

Give 2 concise sentences of set feedback the user can apply before the next set. Mention the most important detected issue when there is one; otherwise comment on the strongest range-of-motion or consistency signal.`
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
  const outputText = extractOutputText(payload);

  if (!outputText) {
    console.error("OpenAI coaching failed: response did not include output_text.", payload);
    return fallbackCoaching(input);
  }

  return outputText;
}
