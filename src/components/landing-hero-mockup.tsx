"use client";

export default function LandingHeroMockup() {
  return (
    <div className="relative w-full max-w-4xl mx-auto aspect-[16/10] select-none pointer-events-none">
      <div
        className="absolute inset-0"
        style={{ perspective: "1400px" }}
      >
        {/* Card arriere gauche : Roulette */}
        <div
          className="absolute top-[20%] left-[4%] w-[32%] sm:w-[28%]"
          style={{ transform: "rotateY(18deg) rotateX(-4deg) translateZ(-60px)" }}
        >
          <MockCard accent="#A855F7" emoji="🎡" label="Roulette">
            <RouletteMock />
          </MockCard>
        </div>

        {/* Card arriere droite : Plinko */}
        <div
          className="absolute top-[14%] right-[4%] w-[30%] sm:w-[26%]"
          style={{ transform: "rotateY(-20deg) rotateX(-4deg) translateZ(-50px)" }}
        >
          <MockCard accent="#EC4899" emoji="🟣" label="Plinko">
            <PlinkoMock />
          </MockCard>
        </div>

        {/* Card secondaire gauche : Dice */}
        <div
          className="absolute top-[52%] left-[12%] w-[28%] sm:w-[24%]"
          style={{ transform: "rotateY(14deg) rotateX(2deg) translateZ(-20px)" }}
        >
          <MockCard accent="#F59E0B" emoji="🎲" label="Dice">
            <DiceMock />
          </MockCard>
        </div>

        {/* Card secondaire droite : Mines */}
        <div
          className="absolute top-[56%] right-[14%] w-[26%] sm:w-[22%]"
          style={{ transform: "rotateY(-14deg) rotateX(2deg) translateZ(-20px)" }}
        >
          <MockCard accent="#10B981" emoji="💣" label="Mines">
            <MinesMock />
          </MockCard>
        </div>

        {/* Card centrale : Morpion */}
        <div
          className="absolute top-[18%] left-1/2 -translate-x-1/2 w-[44%] sm:w-[38%]"
          style={{ transform: "translateX(-50%) rotateX(-2deg)" }}
        >
          <MockCard accent="#251B9F" emoji="❌⭕" label="Morpion" featured>
            <MorpionMock />
            <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] sm:text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <span>🏆</span>
              <span>Gain : +9 CRC</span>
            </div>
          </MockCard>
        </div>
      </div>
    </div>
  );
}

function MockCard({
  children,
  accent,
  emoji,
  label,
  featured,
}: {
  children: React.ReactNode;
  accent: string;
  emoji: string;
  label: string;
  featured?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl bg-white dark:bg-white/10 backdrop-blur-md ${
        featured
          ? "border-2 shadow-2xl p-3 sm:p-4"
          : "border shadow-lg p-2.5 sm:p-3"
      }`}
      style={{
        borderColor: featured ? accent : "rgba(0,0,0,0.08)",
        boxShadow: featured
          ? `0 25px 50px -12px ${accent}40, 0 8px 20px -8px ${accent}30`
          : "0 15px 30px -12px rgba(0,0,0,0.2)",
      }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-sm sm:text-base">{emoji}</span>
        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-ink/60 dark:text-white/60">
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

function MorpionMock() {
  // X | O | X
  // . | X | O
  // O | . | X    — diagonale gagnante X
  const board = [
    ["X", "O", "X"],
    ["", "X", "O"],
    ["O", "", "X"],
  ];
  const winning = new Set(["0-0", "1-1", "2-2"]);
  return (
    <div className="grid grid-cols-3 gap-1 sm:gap-1.5 aspect-square">
      {board.flatMap((row, r) =>
        row.map((cell, c) => {
          const isWin = winning.has(`${r}-${c}`);
          return (
            <div
              key={`${r}-${c}`}
              className={`flex items-center justify-center rounded-md sm:rounded-lg text-lg sm:text-2xl font-black ${
                isWin
                  ? "bg-marine/10 text-marine ring-2 ring-marine"
                  : "bg-ink/[0.03] dark:bg-white/[0.05]"
              } ${cell === "O" ? "text-citrus" : ""} ${cell === "X" && !isWin ? "text-ink dark:text-white" : ""}`}
            >
              {cell}
            </div>
          );
        }),
      )}
    </div>
  );
}

function DiceMock() {
  return (
    <div className="flex items-center justify-center gap-1.5 sm:gap-2 py-2">
      <DieFace value={5} />
      <DieFace value={3} />
    </div>
  );
}

function DieFace({ value }: { value: number }) {
  const positions: Record<number, boolean[]> = {
    1: [false, false, false, false, true, false, false, false, false],
    2: [true, false, false, false, false, false, false, false, true],
    3: [true, false, false, false, true, false, false, false, true],
    4: [true, false, true, false, false, false, true, false, true],
    5: [true, false, true, false, true, false, true, false, true],
    6: [true, false, true, true, false, true, true, false, true],
  };
  const dots = positions[value] ?? positions[1];
  return (
    <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-lg bg-white dark:bg-white/10 border-2 border-ink/10 dark:border-white/10 shadow-md p-1.5 grid grid-cols-3 gap-0.5">
      {dots.map((show, i) => (
        <div
          key={i}
          className={`rounded-full ${show ? "bg-ink dark:bg-white" : "bg-transparent"}`}
        />
      ))}
    </div>
  );
}

function PlinkoMock() {
  return (
    <div className="relative aspect-[3/4] bg-gradient-to-b from-pink-50 to-pink-100 dark:from-pink-950/40 dark:to-pink-900/40 rounded-lg overflow-hidden">
      {/* Pegs */}
      {[0, 1, 2, 3, 4].map((row) => (
        <div
          key={row}
          className="flex justify-center gap-2 sm:gap-3 absolute left-0 right-0"
          style={{ top: `${15 + row * 15}%` }}
        >
          {Array.from({ length: row + 3 }).map((_, c) => (
            <div key={c} className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-pink-500/60" />
          ))}
        </div>
      ))}
      {/* Ball */}
      <div
        className="absolute w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-pink-500 shadow-lg"
        style={{ top: "48%", left: "62%" }}
      />
      {/* Slots */}
      <div className="absolute bottom-1 left-0 right-0 flex justify-around text-[8px] sm:text-[10px] font-bold text-pink-700 dark:text-pink-300">
        <span>0.5x</span>
        <span>2x</span>
        <span>5x</span>
        <span>2x</span>
        <span>0.5x</span>
      </div>
    </div>
  );
}

function RouletteMock() {
  return (
    <div className="relative aspect-square flex items-center justify-center">
      <div className="absolute inset-0 rounded-full bg-gradient-conic from-red-500 via-ink to-red-500 dark:from-red-600 dark:via-black dark:to-red-600" style={{ background: "conic-gradient(from 0deg, #DC2626 0deg 20deg, #1b1b1f 20deg 40deg, #DC2626 40deg 60deg, #1b1b1f 60deg 80deg, #10B981 80deg 100deg, #DC2626 100deg 120deg, #1b1b1f 120deg 140deg, #DC2626 140deg 160deg, #1b1b1f 160deg 180deg, #DC2626 180deg 200deg, #1b1b1f 200deg 220deg, #DC2626 220deg 240deg, #1b1b1f 240deg 260deg, #DC2626 260deg 280deg, #1b1b1f 280deg 300deg, #DC2626 300deg 320deg, #1b1b1f 320deg 340deg, #DC2626 340deg 360deg)" }} />
      <div className="absolute inset-[15%] rounded-full bg-white dark:bg-ink flex items-center justify-center">
        <span className="text-base sm:text-xl font-black text-ink dark:text-white">17</span>
      </div>
      {/* Ball */}
      <div className="absolute w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-white shadow-md" style={{ top: "8%", left: "50%", transform: "translateX(-50%)" }} />
    </div>
  );
}

function MinesMock() {
  const grid = [
    ["💎", "", "", "💣"],
    ["", "💎", "", ""],
    ["", "", "💎", ""],
    ["", "", "", "💎"],
  ];
  return (
    <div className="grid grid-cols-4 gap-0.5 sm:gap-1">
      {grid.flat().map((cell, i) => (
        <div
          key={i}
          className={`aspect-square flex items-center justify-center text-[10px] sm:text-sm rounded ${
            cell
              ? cell === "💣"
                ? "bg-red-100 dark:bg-red-900/40"
                : "bg-emerald-100 dark:bg-emerald-900/40"
              : "bg-ink/[0.04] dark:bg-white/[0.06]"
          }`}
        >
          {cell}
        </div>
      ))}
    </div>
  );
}
