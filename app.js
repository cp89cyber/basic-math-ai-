(function () {
  "use strict";

  const STORAGE_KEY = "basic-math-ai:v1";
  const OPERATORS = ["+", "-", "*", "/"];
  const MEMORY_SOURCE = "__memory__";
  const SPIRAL_SOURCE = "__spiral__";
  const PROBLEM_PATTERN = /^\s*(-?\d+)\s*([+\-*/])\s*(-?\d+)\s*$/;
  const HYPOTHESES = [
    {
      id: "left",
      label: "left",
      evaluate(problem) {
        return problem.left;
      },
    },
    {
      id: "right",
      label: "right",
      evaluate(problem) {
        return problem.right;
      },
    },
    {
      id: "0",
      label: "0",
      evaluate() {
        return 0;
      },
    },
    {
      id: "1",
      label: "1",
      evaluate() {
        return 1;
      },
    },
    {
      id: "-1",
      label: "-1",
      evaluate() {
        return -1;
      },
    },
    {
      id: "left+right",
      label: "left+right",
      evaluate(problem) {
        return problem.left + problem.right;
      },
    },
    {
      id: "left-right",
      label: "left-right",
      evaluate(problem) {
        return problem.left - problem.right;
      },
    },
    {
      id: "right-left",
      label: "right-left",
      evaluate(problem) {
        return problem.right - problem.left;
      },
    },
    {
      id: "left*right",
      label: "left*right",
      evaluate(problem) {
        return problem.left * problem.right;
      },
    },
    {
      id: "left/right",
      label: "left/right",
      evaluate(problem) {
        if (problem.right === 0) {
          return null;
        }

        if (problem.left % problem.right !== 0) {
          return null;
        }

        return problem.left / problem.right;
      },
    },
  ];

  const elements = {
    form: document.getElementById("problem-form"),
    input: document.getElementById("problem-input"),
    message: document.getElementById("form-message"),
    activeEmpty: document.getElementById("active-empty"),
    activeContent: document.getElementById("active-content"),
    activeProblem: document.getElementById("active-problem"),
    currentGuess: document.getElementById("current-guess"),
    guessSource: document.getElementById("guess-source"),
    wrongButton: document.getElementById("wrong-button"),
    rightButton: document.getElementById("right-button"),
    historyList: document.getElementById("history-list"),
    historyEmpty: document.getElementById("history-empty"),
    totalSolved: document.getElementById("total-solved"),
    operatorStats: document.getElementById("operator-stats"),
    resetButton: document.getElementById("reset-button"),
  };

  let knowledge = loadKnowledge();
  let session = createEmptySession();

  elements.form.addEventListener("submit", function (event) {
    event.preventDefault();
    startProblem(elements.input.value);
  });

  elements.wrongButton.addEventListener("click", markGuessWrong);
  elements.rightButton.addEventListener("click", markGuessRight);
  elements.resetButton.addEventListener("click", function () {
    if (!window.confirm("Reset all stored math learning?")) {
      return;
    }

    resetKnowledge();
  });

  render();

  function createDefaultKnowledge() {
    return {
      version: 1,
      exactAnswers: {},
      operatorWeights: createDefaultOperatorWeights(),
      operatorStats: {
        totalSolved: 0,
        solvedCounts: createDefaultSolvedCounts(),
      },
    };
  }

  function createDefaultOperatorWeights() {
    const weights = {};

    OPERATORS.forEach(function (operator) {
      weights[operator] = {};

      HYPOTHESES.forEach(function (hypothesis) {
        weights[operator][hypothesis.id] = 1;
      });
    });

    return weights;
  }

  function createDefaultSolvedCounts() {
    const solvedCounts = {};

    OPERATORS.forEach(function (operator) {
      solvedCounts[operator] = 0;
    });

    return solvedCounts;
  }

  function createEmptySession() {
    return {
      activeProblem: null,
      currentGuess: null,
      currentGuessSources: [],
      rejectedGuesses: [],
      attemptHistory: [],
      candidateCache: null,
    };
  }

  function loadKnowledge() {
    const fallback = createDefaultKnowledge();

    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        return fallback;
      }

      const parsed = JSON.parse(raw);

      return normalizeKnowledge(parsed);
    } catch (error) {
      return fallback;
    }
  }

  function normalizeKnowledge(candidate) {
    const base = createDefaultKnowledge();

    if (!candidate || typeof candidate !== "object") {
      return base;
    }

    if (candidate.version !== 1) {
      return base;
    }

    if (candidate.exactAnswers && typeof candidate.exactAnswers === "object") {
      base.exactAnswers = {};

      Object.keys(candidate.exactAnswers).forEach(function (key) {
        const value = candidate.exactAnswers[key];

        if (Number.isInteger(value)) {
          base.exactAnswers[key] = value;
        }
      });
    }

    if (candidate.operatorWeights && typeof candidate.operatorWeights === "object") {
      OPERATORS.forEach(function (operator) {
        const incomingWeights = candidate.operatorWeights[operator];

        if (!incomingWeights || typeof incomingWeights !== "object") {
          return;
        }

        HYPOTHESES.forEach(function (hypothesis) {
          const incomingValue = incomingWeights[hypothesis.id];

          if (typeof incomingValue === "number" && Number.isFinite(incomingValue)) {
            base.operatorWeights[operator][hypothesis.id] = clampWeight(incomingValue);
          }
        });
      });
    }

    const incomingStats = candidate.operatorStats;

    if (incomingStats && typeof incomingStats === "object") {
      if (
        typeof incomingStats.totalSolved === "number" &&
        Number.isFinite(incomingStats.totalSolved) &&
        incomingStats.totalSolved >= 0
      ) {
        base.operatorStats.totalSolved = Math.floor(incomingStats.totalSolved);
      }

      if (incomingStats.solvedCounts && typeof incomingStats.solvedCounts === "object") {
        OPERATORS.forEach(function (operator) {
          const incomingCount = incomingStats.solvedCounts[operator];

          if (
            typeof incomingCount === "number" &&
            Number.isFinite(incomingCount) &&
            incomingCount >= 0
          ) {
            base.operatorStats.solvedCounts[operator] = Math.floor(incomingCount);
          }
        });
      }
    }

    return base;
  }

  function saveKnowledge() {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(knowledge));
  }

  function resetKnowledge() {
    window.localStorage.removeItem(STORAGE_KEY);
    knowledge = createDefaultKnowledge();
    session = createEmptySession();
    setMessage("Learning reset. Enter a new problem to start over.", "success");
    render();
    elements.input.focus();
  }

  function parseProblem(input) {
    const match = PROBLEM_PATTERN.exec(input || "");

    if (!match) {
      return {
        ok: false,
        message: "Enter a problem like 2+2, 9-4, 3*7, or 8/2.",
      };
    }

    const left = Number.parseInt(match[1], 10);
    const op = match[2];
    const right = Number.parseInt(match[3], 10);

    if (op === "/" && right === 0) {
      return {
        ok: false,
        message: "Division by zero is not allowed.",
      };
    }

    if (op === "/" && left % right !== 0) {
      return {
        ok: false,
        message: "Division problems must have a whole-number answer in this version.",
      };
    }

    const normalized = left + " " + op + " " + right;

    return {
      ok: true,
      problem: {
        raw: input,
        key: normalized,
        left: left,
        op: op,
        right: right,
      },
    };
  }

  function startProblem(input) {
    const parsed = parseProblem(input);

    if (!parsed.ok) {
      session = createEmptySession();
      setMessage(parsed.message, "error");
      render();
      return;
    }

    session = {
      activeProblem: parsed.problem,
      currentGuess: null,
      currentGuessSources: [],
      rejectedGuesses: [],
      attemptHistory: [],
      candidateCache: null,
    };

    setMessage("Problem loaded. Mark each generated answer as right or wrong.", "");
    generateNextGuess();
    render();
  }

  function generateNextGuess() {
    if (!session.activeProblem) {
      return;
    }

    const seen = new Set(session.rejectedGuesses);
    const memorized = knowledge.exactAnswers[session.activeProblem.key];

    if (Number.isInteger(memorized) && !seen.has(memorized)) {
      session.currentGuess = memorized;
      session.currentGuessSources = [MEMORY_SOURCE];
      return;
    }

    const candidateCache = buildCandidateCache(session.activeProblem);
    session.candidateCache = candidateCache;

    const unseenCandidate = candidateCache.sortedCandidates.find(function (candidate) {
      return !seen.has(candidate.value);
    });

    if (unseenCandidate) {
      session.currentGuess = unseenCandidate.value;
      session.currentGuessSources = unseenCandidate.sources.slice();
      return;
    }

    const baseValue =
      candidateCache.sortedCandidates.length > 0
        ? candidateCache.sortedCandidates[0].value
        : 0;
    const spiralGuess = findSpiralGuess(baseValue, seen);

    session.currentGuess = spiralGuess;
    session.currentGuessSources = [SPIRAL_SOURCE];
  }

  function buildCandidateCache(problem) {
    const operatorWeights = knowledge.operatorWeights[problem.op];
    const grouped = new Map();

    HYPOTHESES.forEach(function (hypothesis, index) {
      const value = hypothesis.evaluate(problem);

      if (!Number.isInteger(value)) {
        return;
      }

      const existing = grouped.get(value);

      if (existing) {
        existing.score += operatorWeights[hypothesis.id];
        existing.sources.push(hypothesis.id);
        existing.firstIndex = Math.min(existing.firstIndex, index);
        return;
      }

      grouped.set(value, {
        value: value,
        score: operatorWeights[hypothesis.id],
        sources: [hypothesis.id],
        firstIndex: index,
      });
    });

    const sortedCandidates = Array.from(grouped.values()).sort(function (left, right) {
      if (right.score !== left.score) {
        return right.score - left.score;
      }

      if (left.firstIndex !== right.firstIndex) {
        return left.firstIndex - right.firstIndex;
      }

      return left.value - right.value;
    });

    return {
      sortedCandidates: sortedCandidates,
    };
  }

  function findSpiralGuess(baseValue, seen) {
    if (!seen.has(baseValue)) {
      return baseValue;
    }

    for (let step = 1; step < 10000; step += 1) {
      const positive = baseValue + step;

      if (!seen.has(positive)) {
        return positive;
      }

      const negative = baseValue - step;

      if (!seen.has(negative)) {
        return negative;
      }
    }

    return baseValue + seen.size + 1;
  }

  function markGuessWrong() {
    if (!session.activeProblem || session.currentGuess === null) {
      return;
    }

    const problem = session.activeProblem;
    const guess = session.currentGuess;

    session.attemptHistory.push({ guess: guess, verdict: "wrong" });
    session.rejectedGuesses.push(guess);

    if (session.currentGuessSources.includes(MEMORY_SOURCE)) {
      removeStoredAnswer(problem);
    }

    adjustWeights(problem.op, session.currentGuessSources, -0.4);
    saveKnowledge();
    generateNextGuess();
    setMessage("Marked wrong. The learner generated a new answer.", "");
    render();
  }

  function markGuessRight() {
    if (!session.activeProblem || session.currentGuess === null) {
      return;
    }

    const problem = session.activeProblem;
    const guess = session.currentGuess;
    const alreadyKnown = Number.isInteger(knowledge.exactAnswers[problem.key]);

    session.attemptHistory.push({ guess: guess, verdict: "right" });

    if (!alreadyKnown) {
      knowledge.operatorStats.totalSolved += 1;
      knowledge.operatorStats.solvedCounts[problem.op] += 1;
    }

    knowledge.exactAnswers[problem.key] = guess;
    adjustWeights(problem.op, session.currentGuessSources, 1);
    saveKnowledge();

    const solvedLabel = problem.key + " = " + guess;
    session = createEmptySession();
    setMessage("Learned: " + solvedLabel + ". Enter the next problem.", "success");
    render();
    elements.input.focus();
    elements.input.select();
  }

  function adjustWeights(operator, sources, delta) {
    sources.forEach(function (source) {
      if (source === MEMORY_SOURCE || source === SPIRAL_SOURCE) {
        return;
      }

      const current = knowledge.operatorWeights[operator][source];
      knowledge.operatorWeights[operator][source] = clampWeight(current + delta);
    });
  }

  function clampWeight(value) {
    return Math.max(0.1, Number(value.toFixed(4)));
  }

  function removeStoredAnswer(problem) {
    if (!Object.prototype.hasOwnProperty.call(knowledge.exactAnswers, problem.key)) {
      return;
    }

    delete knowledge.exactAnswers[problem.key];
    knowledge.operatorStats.totalSolved = Math.max(
      0,
      knowledge.operatorStats.totalSolved - 1
    );
    knowledge.operatorStats.solvedCounts[problem.op] = Math.max(
      0,
      knowledge.operatorStats.solvedCounts[problem.op] - 1
    );
  }

  function describeSources(sources) {
    if (!sources.length) {
      return "No source data available.";
    }

    if (sources.includes(MEMORY_SOURCE)) {
      return "Source: exact memory from a previously solved problem.";
    }

    if (sources.includes(SPIRAL_SOURCE)) {
      return "Source: fallback search after all weighted hypotheses were rejected.";
    }

    return "Weighted hypotheses: " + sources.join(", ");
  }

  function getTopHypothesis(operator) {
    const weights = knowledge.operatorWeights[operator];
    let top = null;

    HYPOTHESES.forEach(function (hypothesis, index) {
      const value = weights[hypothesis.id];

      if (!top) {
        top = {
          id: hypothesis.id,
          weight: value,
          index: index,
        };
        return;
      }

      if (value > top.weight) {
        top = {
          id: hypothesis.id,
          weight: value,
          index: index,
        };
        return;
      }

      if (value === top.weight && index < top.index) {
        top = {
          id: hypothesis.id,
          weight: value,
          index: index,
        };
      }
    });

    return top;
  }

  function render() {
    renderActivePanel();
    renderHistory();
    renderStats();
    renderButtons();
  }

  function renderActivePanel() {
    const hasProblem = Boolean(session.activeProblem);

    elements.activeEmpty.hidden = hasProblem;
    elements.activeContent.hidden = !hasProblem;

    if (!hasProblem) {
      elements.activeProblem.textContent = "";
      elements.currentGuess.textContent = "0";
      elements.guessSource.textContent = "";
      return;
    }

    elements.activeProblem.textContent = session.activeProblem.key;
    elements.currentGuess.textContent = String(session.currentGuess);
    elements.guessSource.textContent = describeSources(session.currentGuessSources);
  }

  function renderHistory() {
    elements.historyList.innerHTML = "";

    if (!session.attemptHistory.length) {
      elements.historyEmpty.hidden = false;
      return;
    }

    elements.historyEmpty.hidden = true;

    session.attemptHistory.forEach(function (entry) {
      const item = document.createElement("li");
      const label = document.createElement("strong");
      const suffix = document.createElement("span");

      item.className = "history-item " + entry.verdict;
      label.textContent = String(entry.guess);
      suffix.textContent =
        entry.verdict === "right" ? " marked right" : " marked wrong";

      item.appendChild(label);
      item.appendChild(suffix);
      elements.historyList.appendChild(item);
    });
  }

  function renderStats() {
    elements.totalSolved.textContent = String(knowledge.operatorStats.totalSolved);
    elements.operatorStats.innerHTML = "";

    OPERATORS.forEach(function (operator) {
      const top = getTopHypothesis(operator);
      const card = document.createElement("section");
      const title = document.createElement("h3");
      const solvedLine = document.createElement("p");
      const topLine = document.createElement("p");

      card.className = "operator-card";
      title.textContent = "Operator " + operator;
      title.className = "operator-title";

      solvedLine.className = "operator-line";
      solvedLine.innerHTML =
        "<span>Solved stored</span><strong>" +
        knowledge.operatorStats.solvedCounts[operator] +
        "</strong>";

      topLine.className = "operator-line";
      topLine.innerHTML =
        "<span>Top hypothesis</span><strong>" +
        top.id +
        " (" +
        top.weight.toFixed(1) +
        ")</strong>";

      card.appendChild(title);
      card.appendChild(solvedLine);
      card.appendChild(topLine);
      elements.operatorStats.appendChild(card);
    });
  }

  function renderButtons() {
    const enabled = Boolean(session.activeProblem) && session.currentGuess !== null;

    elements.wrongButton.disabled = !enabled;
    elements.rightButton.disabled = !enabled;
  }

  function setMessage(text, tone) {
    elements.message.textContent = text;
    elements.message.className = "message";

    if (tone) {
      elements.message.classList.add(tone);
    }
  }

  window.basicMathAI = {
    parseProblem: parseProblem,
    startProblem: startProblem,
    generateNextGuess: generateNextGuess,
    markGuessWrong: markGuessWrong,
    markGuessRight: markGuessRight,
    loadKnowledge: loadKnowledge,
    resetKnowledge: resetKnowledge,
  };
})();
