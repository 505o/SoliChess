import { createRequire } from "node:module";

interface StockfishModule {
  listener?: (line: string) => void;
  sendCommand(command: string): void;
}

type StockfishInitializer = (flavor: "lite-single") => Promise<StockfishModule>;

export interface EngineEvaluation {
  centipawns: number;
  bestMove: string | null;
  principalVariation: string[];
  depth: number;
}

const require = createRequire(import.meta.url);
const initializeStockfish = require("stockfish") as StockfishInitializer;

function scoreToCentipawns(type: string, value: number): number {
  if (type === "cp") return value;
  const sign = Math.sign(value) || 1;
  return sign * (100_000 - Math.min(999, Math.abs(value)) * 100);
}

export class StockfishEngine {
  private enginePromise: Promise<StockfishModule> | null = null;
  private queue: Promise<void> = Promise.resolve();

  analyzeFen(fen: string, depth: number): Promise<EngineEvaluation> {
    const job = this.queue.then(() => this.runAnalysis(fen, depth));
    this.queue = job.then(() => undefined, () => undefined);
    return job;
  }

  private getEngine(): Promise<StockfishModule> {
    if (!this.enginePromise) {
      const nativeFetch = globalThis.fetch;
      try {
        this.enginePromise = initializeStockfish("lite-single");
      } finally {
        // The Stockfish Node bundle sets the process-wide fetch global to null.
        // Restore Node's native implementation so Chess.com and Lichess keep working.
        globalThis.fetch = nativeFetch;
      }
    }
    return this.enginePromise;
  }

  private async runAnalysis(fen: string, depth: number): Promise<EngineEvaluation> {
    const engine = await this.getEngine();
    return new Promise<EngineEvaluation>((resolve, reject) => {
      let latestScore = 0;
      let latestPv: string[] = [];
      let latestDepth = 0;
      let settled = false;

      const timeout = setTimeout(() => {
        if (settled) return;
        engine.sendCommand("stop");
        settled = true;
        reject(new Error("انتهت مهلة المراجعة. حاول مرة أخرى."));
      }, 20_000);

      engine.listener = (rawLine: string) => {
        const line = String(rawLine);
        if (line.startsWith("info ") && line.includes(" score ")) {
          const score = /\bscore (cp|mate) (-?\d+)/.exec(line);
          const depthMatch = /\bdepth (\d+)/.exec(line);
          const pvMatch = /\bpv (.+)$/.exec(line);
          if (score) latestScore = scoreToCentipawns(score[1]!, Number.parseInt(score[2]!, 10));
          if (depthMatch) latestDepth = Number.parseInt(depthMatch[1]!, 10);
          if (pvMatch) latestPv = pvMatch[1]!.trim().split(/\s+/);
        }
        if (!line.startsWith("bestmove ") || settled) return;
        settled = true;
        clearTimeout(timeout);
        const best = /^bestmove (\S+)/.exec(line)?.[1] ?? "(none)";
        resolve({
          centipawns: latestScore,
          bestMove: best === "(none)" ? null : best,
          principalVariation: latestPv,
          depth: latestDepth
        });
      };

      engine.sendCommand(`position fen ${fen}`);
      engine.sendCommand(`go depth ${depth}`);
    });
  }
}
