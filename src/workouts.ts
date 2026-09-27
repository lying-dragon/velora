import flux from "./workouts/flux.json";
export type Step = {
  label: string;
  seconds: number;
  factor: number;
  factorEnd?: number;
  cadenceLow: number;
  cadenceHigh: number;
};
export type Workout = {
  name: string;
  category: string;
  detail: string;
  description: string;
  origin: string;
  source?: string;
  steps: Step[];
};
export const workouts: Record<string, Workout> = {
  free: {
    name: "자유 라이딩",
    category: "자유",
    detail: "코스 경사에 맞춘 SIM",
    description: "오르막과 내리막의 저항을 그대로 느끼며 달립니다.",
    origin: "VELORA",
    steps: [],
  },
  endurance: {
    name: "Z2 30 · 베이스 빌더",
    category: "Z2",
    detail: "30분 · 주 구간 FTP 67%",
    description: "Flux Butter의 강도 구성을 바탕으로 만든 짧은 지구력 훈련.",
    origin: "VELORA · Flux Butter 변형",
    steps: [
      {
        label: "워밍업",
        seconds: 300,
        factor: 0.4,
        factorEnd: 0.6,
        cadenceLow: 75,
        cadenceHigh: 85,
      },
      {
        label: "Z2 지구력",
        seconds: 1200,
        factor: 0.67,
        cadenceLow: 80,
        cadenceHigh: 90,
      },
      {
        label: "쿨다운",
        seconds: 300,
        factor: 0.6,
        factorEnd: 0.35,
        cadenceLow: 70,
        cadenceHigh: 85,
      },
    ],
  },
  ramp: {
    name: "Ramp Test · FTP 측정",
    category: "테스트",
    detail: "5분 워밍업 · 매분 FTP 6% 증가",
    description:
      "Flux 방식: FTP 46%에서 5분 준비 후 52%부터 매분 6% 증가. 유지할 수 없으면 종료하고 FTP 추정치를 확인하세요.",
    origin: "Flux Ramp Test · 실측 최고 60초 × 75%",
    steps: [
      {
        label: "워밍업",
        seconds: 300,
        factor: 0.46,
        cadenceLow: 80,
        cadenceHigh: 95,
      },
      ...Array.from({ length: 26 }, (_, i) => ({
        label: `램프 ${i + 1}`,
        seconds: 60,
        factor: Math.round((0.52 + i * 0.06) * 100) / 100,
        cadenceLow: 80,
        cadenceHigh: 95,
      })),
    ],
  },
  ...flux,
};
export function workoutDuration(key: string) {
  return workouts[key].steps.reduce((n, s) => n + s.seconds, 0);
}
export function workoutStep(key: string, elapsed: number) {
  let start = 0;
  const steps = workouts[key].steps;
  for (let index = 0; index < steps.length; index++) {
    const step = steps[index];
    if (elapsed < start + step.seconds) {
      const progress = Math.max(0, (elapsed - start) / step.seconds);
      return {
        ...step,
        factor:
          step.factor +
          ((step.factorEnd ?? step.factor) - step.factor) * progress,
        remaining: start + step.seconds - elapsed,
        start,
        index,
        progress,
        next: steps[index + 1] ?? null,
      };
    }
    start += step.seconds;
  }
  return null;
}
export function workoutMetrics(key: string) {
  const steps = workouts[key].steps,
    total = workoutDuration(key);
  if (!total) return { minutes: 0, intensity: 0, tss: 0 };
  const fourth = steps.reduce((sum, s) => {
    const a = s.factor,
      b = s.factorEnd ?? a;
    let avg = 0;
    for (let i = 0; i < 20; i++)
      avg += Math.pow(a + ((b - a) * (i + 0.5)) / 20, 4) / 20;
    return sum + avg * s.seconds;
  }, 0);
  const intensity = Math.pow(fourth / total, 0.25);
  return {
    minutes: total / 60,
    intensity,
    tss: Math.round((total / 3600) * intensity * intensity * 100),
  };
}
