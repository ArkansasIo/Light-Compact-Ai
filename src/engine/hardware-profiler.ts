import { cpus, freemem, platform, totalmem, arch } from "node:os";

export type ComputeBackend =
  | "cpu"
  | "cuda"
  | "rocm"
  | "metal"
  | "webgpu"
  | "unknown";
export interface GpuDeviceProfile {
  name: string;
  backend: ComputeBackend;
  totalMemoryBytes?: number;
  freeMemoryBytes?: number;
  computeUnits?: number;
}
export interface HardwareProfile {
  platform: string;
  architecture: string;
  cpuModel: string;
  cpuCores: number;
  logicalCores: number;
  totalRamBytes: number;
  freeRamBytes: number;
  gpus: GpuDeviceProfile[];
  detectedAt: string;
}
export type GpuProbe = () => Promise<readonly GpuDeviceProfile[]>;

/** Detects portable CPU/RAM information and optionally queries installed GPU adapters. */
export async function profileHardware(
  gpuProbes: readonly GpuProbe[] = [],
): Promise<HardwareProfile> {
  const cpuList = cpus();
  const detected: GpuDeviceProfile[] = [];
  for (const probe of gpuProbes) {
    try {
      detected.push(...(await probe()));
    } catch {
      /* An unavailable GPU runtime must not prevent CPU profiling. */
    }
  }
  return {
    platform: platform(),
    architecture: arch(),
    cpuModel: cpuList[0]?.model ?? "Unknown CPU",
    cpuCores: new Set(cpuList.map((cpu) => cpu.model)).size || 1,
    logicalCores: cpuList.length,
    totalRamBytes: totalmem(),
    freeRamBytes: freemem(),
    gpus: detected,
    detectedAt: new Date().toISOString(),
  };
}

export function availableMemoryBytes(
  profile: HardwareProfile,
  reserveFraction = 0.2,
): number {
  if (
    !Number.isFinite(reserveFraction) ||
    reserveFraction < 0 ||
    reserveFraction >= 1
  )
    throw new Error("reserveFraction must be in [0, 1).");
  const hostAvailable = Math.min(
    profile.freeRamBytes,
    profile.totalRamBytes * (1 - reserveFraction),
  );
  const gpuAvailable = profile.gpus.reduce(
    (sum, gpu) => sum + Math.max(0, gpu.freeMemoryBytes ?? 0),
    0,
  );
  return hostAvailable + gpuAvailable;
}

export function describeHardware(profile: HardwareProfile): string {
  const gib = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GiB`;
  const gpuText = profile.gpus.length
    ? profile.gpus
        .map(
          (g) =>
            `${g.name} (${g.backend}, ${g.freeMemoryBytes === undefined ? "VRAM unknown" : `${gib(g.freeMemoryBytes)} free VRAM`})`,
        )
        .join("; ")
    : "No GPU adapter reported; CPU-only fallback available.";
  return `${profile.cpuModel}; ${profile.logicalCores} logical CPU cores; ${gib(profile.freeRamBytes)} free RAM; ${gpuText}`;
}
