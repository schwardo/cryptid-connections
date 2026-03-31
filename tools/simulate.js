#!/usr/bin/env node
// Simulate Cryptid Connections AI games to measure strategy win rates.
// Usage: node simulate.js [numGames]
//   default: 5000 games per matchup

const NUM_GAMES = parseInt(process.argv[2]) || 5000;
const CARDS_PER_HAND = 7;
const WIN_SCORE = 10;
const STRATEGIES = ['greedy', 'strategic', 'cardcounter', 'lazy', 'morelazy', 'mostlazy', 'random'];

// --- Deck ---
const DECK = [];
for (let i = 0; i < 64; i++) {
    let binary = i.toString(2).padStart(6, '0');
    DECK.push({ id: i, traits: binary.split('').map(b => parseInt(b)) });
}

function lazyMaxSlots(strategy) {
    if (strategy === 'mostlazy') return 2;
    if (strategy === 'morelazy') return 3;
    if (strategy === 'lazy') return 4;
    return undefined;
}

// --- Scoring ---
function scoreCardForSlots(card, slots, maxSlots) {
    let limit = maxSlots || 6;
    let score = 0;
    for (let slot = 0; slot < limit; slot++) {
        let r = slots[slot];
        if (!r) continue;
        if (card.traits[r.tileIndex] === r.side) {
            score += (1 << (5 - slot));
        }
    }
    return score;
}

function bestCardScore(hand, slots, maxSlots) {
    let max = -1;
    for (let c of hand) {
        let s = scoreCardForSlots(c, slots, maxSlots);
        if (s > max) max = s;
    }
    return max;
}

function pairwiseResult(myCard, oppCard, slots) {
    for (let slot = 0; slot < 6; slot++) {
        let r = slots[slot];
        if (!r) continue;
        let myMatch = myCard.traits[r.tileIndex] === r.side;
        let oppMatch = oppCard.traits[r.tileIndex] === r.side;
        if (myMatch && !oppMatch) return 1;
        if (!myMatch && oppMatch) return -1;
    }
    return 0;
}

function strategicFutureValue(hand, cardIdx, slots) {
    let remaining = hand.filter((_, idx) => idx !== cardIdx);
    let bestManipValue = remaining.length > 0 ? bestCardScore(remaining, slots) : 0;
    for (let s = 0; s < 6; s++) {
        if (!slots[s]) continue;
        let flipped = JSON.parse(JSON.stringify(slots));
        flipped[s].side = 1 - flipped[s].side;
        let flipBest = remaining.length > 0 ? bestCardScore(remaining, flipped) : 0;
        bestManipValue = Math.max(bestManipValue, flipBest);
        for (let s2 = s + 1; s2 < 6; s2++) {
            if (!slots[s2]) continue;
            let swapped = JSON.parse(JSON.stringify(slots));
            let temp = swapped[s];
            swapped[s] = swapped[s2];
            swapped[s2] = temp;
            let swapBest = remaining.length > 0 ? bestCardScore(remaining, swapped) : 0;
            bestManipValue = Math.max(bestManipValue, swapBest);
        }
    }
    return bestManipValue;
}

// CardCounter helper: best win rate of any card in hand vs unknown opponent pool
function cardCounterBestWinRate(hand, slots, expeditionSeenCards) {
    let knownIds = new Set(hand.map(c => c.id).concat(expeditionSeenCards.map(c => c.id)));
    let unknownPool = DECK.filter(c => !knownIds.has(c.id));
    let bestWR = -1;
    for (let card of hand) {
        let wins = 0;
        for (let opp of unknownPool) {
            let r = pairwiseResult(card, opp, slots);
            if (r > 0) wins++;
            else if (r === 0) wins += 0.5;
        }
        let wr = unknownPool.length > 0 ? wins / unknownPool.length : 0;
        if (wr > bestWR) bestWR = wr;
    }
    return bestWR;
}

// --- AI Draft ---
function aiDraftChoice(player, slotIdx, availableTiles, sightingReportSlots, expeditionSeenCards) {
    if (player.aiStrategy === 'random') {
        let idx = Math.floor(Math.random() * availableTiles.length);
        return { tileIndex: availableTiles[idx], side: Math.floor(Math.random() * 2) };
    }

    if (player.aiStrategy === 'cardcounter' && player.hand.length > 0) {
        let bestTile = availableTiles[0], bestSide = 0, bestWR = -1;
        for (let t of availableTiles) {
            for (let s = 0; s < 2; s++) {
                let simSlots = sightingReportSlots.map(x => x ? {...x} : null);
                simSlots[slotIdx] = { tileIndex: t, side: s };
                let wr = cardCounterBestWinRate(player.hand, simSlots, expeditionSeenCards);
                if (wr > bestWR) { bestWR = wr; bestTile = t; bestSide = s; }
            }
        }
        return { tileIndex: bestTile, side: bestSide };
    }

    let idx = Math.floor(Math.random() * availableTiles.length);
    let tileIndex = availableTiles[idx];
    let side = Math.floor(Math.random() * 2);

    if (player.hand.length > 0) {
        let bestTile = -1, bestSide = -1, maxMatches = -1;
        for (let t of availableTiles) {
            let side0Count = player.hand.filter(c => c.traits[t] === 0).length;
            let side1Count = player.hand.filter(c => c.traits[t] === 1).length;
            if (side0Count > maxMatches) { maxMatches = side0Count; bestTile = t; bestSide = 0; }
            if (side1Count > maxMatches) { maxMatches = side1Count; bestTile = t; bestSide = 1; }
        }
        tileIndex = bestTile;
        side = bestSide;
    }
    return { tileIndex, side };
}

// --- AI Alter ---
function aiAlterChoice(player, lastAction, sightingReportSlots, expeditionSeenCards) {
    if (player.aiStrategy === 'random') {
        let options = [{ type: 'skip' }];
        for (let i = 0; i < 6; i++) {
            if (!sightingReportSlots[i]) continue;
            if (lastAction && lastAction.type === 'flip' && lastAction.slotIdx === i) continue;
            options.push({ type: 'flip', slotIdx: i });
        }
        if (sightingReportSlots.every(s => s !== null)) {
            for (let i = 0; i < 6; i++) {
                for (let j = i + 1; j < 6; j++) {
                    if (lastAction && lastAction.type === 'swap' && ((lastAction.slot1 === i && lastAction.slot2 === j) || (lastAction.slot1 === j && lastAction.slot2 === i))) continue;
                    options.push({ type: 'swap', slot1: i, slot2: j });
                }
            }
        }
        return options[Math.floor(Math.random() * options.length)];
    }

    // CardCounter: evaluate manipulations by win rate vs unknown pool
    if (player.aiStrategy === 'cardcounter') {
        let bestMove = { type: 'skip' };
        let bestWR = cardCounterBestWinRate(player.hand, sightingReportSlots, expeditionSeenCards);

        function tryMoveCC(simSlots, move) {
            let wr = cardCounterBestWinRate(player.hand, simSlots, expeditionSeenCards);
            if (wr > bestWR) { bestWR = wr; bestMove = move; }
        }

        for (let i = 0; i < 6; i++) {
            if (!sightingReportSlots[i]) continue;
            if (lastAction && lastAction.type === 'flip' && lastAction.slotIdx === i) continue;
            let simSlots = JSON.parse(JSON.stringify(sightingReportSlots));
            simSlots[i].side = 1 - simSlots[i].side;
            tryMoveCC(simSlots, { type: 'flip', slotIdx: i });
        }
        if (sightingReportSlots.every(s => s !== null)) {
            for (let i = 0; i < 6; i++) {
                for (let j = i + 1; j < 6; j++) {
                    if (lastAction && lastAction.type === 'swap' && ((lastAction.slot1 === i && lastAction.slot2 === j) || (lastAction.slot1 === j && lastAction.slot2 === i))) continue;
                    let simSlots = JSON.parse(JSON.stringify(sightingReportSlots));
                    let temp = simSlots[i]; simSlots[i] = simSlots[j]; simSlots[j] = temp;
                    tryMoveCC(simSlots, { type: 'swap', slot1: i, slot2: j });
                }
            }
        }
        return bestMove;
    }

    let bestMove = { type: 'skip' };
    const isStrategic = player.aiStrategy === 'strategic';
    const maxSlots = lazyMaxSlots(player.aiStrategy);
    let bestScore = bestCardScore(player.hand, sightingReportSlots, maxSlots);
    let bestTiebreak = -Infinity;

    function evaluateCandidate(simSlots) {
        let primary = bestCardScore(player.hand, simSlots, maxSlots);
        if (!isStrategic) return { primary, tiebreak: 0 };
        let scores = player.hand.map(c => scoreCardForSlots(c, simSlots)).sort((a, b) => b - a);
        let top2Avg = (scores[0] + (scores[1] || 0)) / Math.min(2, scores.length);
        let allCardTotal = 0;
        for (let i = 0; i < 64; i++) allCardTotal += scoreCardForSlots(DECK[i], simSlots);
        let allCardAvg = allCardTotal / 64;
        return { primary, tiebreak: top2Avg - allCardAvg };
    }

    if (isStrategic) {
        bestTiebreak = evaluateCandidate(sightingReportSlots).tiebreak;
    }

    function tryMove(simSlots, move) {
        let { primary, tiebreak } = evaluateCandidate(simSlots);
        if (primary > bestScore || (primary === bestScore && isStrategic && tiebreak > bestTiebreak)) {
            bestScore = primary;
            bestTiebreak = tiebreak;
            bestMove = move;
        }
    }

    for (let i = 0; i < 6; i++) {
        if (!sightingReportSlots[i]) continue;
        if (lastAction && lastAction.type === 'flip' && lastAction.slotIdx === i) continue;
        let simSlots = JSON.parse(JSON.stringify(sightingReportSlots));
        simSlots[i].side = 1 - simSlots[i].side;
        tryMove(simSlots, { type: 'flip', slotIdx: i });
    }

    if (sightingReportSlots.every(s => s !== null)) {
        for (let i = 0; i < 6; i++) {
            for (let j = i + 1; j < 6; j++) {
                if (lastAction && lastAction.type === 'swap' && ((lastAction.slot1 === i && lastAction.slot2 === j) || (lastAction.slot1 === j && lastAction.slot2 === i))) continue;
                let simSlots = JSON.parse(JSON.stringify(sightingReportSlots));
                let temp = simSlots[i];
                simSlots[i] = simSlots[j];
                simSlots[j] = temp;
                tryMove(simSlots, { type: 'swap', slot1: i, slot2: j });
            }
        }
    }

    return bestMove;
}

// --- AI Propose ---
function aiProposeCard(player, sightingReportSlots, expeditionSeenCards) {
    let bestCardIdx = 0;

    if (player.aiStrategy === 'random') {
        bestCardIdx = Math.floor(Math.random() * player.hand.length);
    } else if (player.aiStrategy === 'cardcounter') {
        // CardCounter: win probability against unknown opponent cards + strategic future value
        let knownIds = new Set(player.hand.map(c => c.id).concat(expeditionSeenCards.map(c => c.id)));
        let unknownPool = DECK.filter(c => !knownIds.has(c.id));

        let bestValue = -Infinity;
        for (let i = 0; i < player.hand.length; i++) {
            let card = player.hand[i];
            let wins = 0;
            for (let opp of unknownPool) {
                let result = pairwiseResult(card, opp, sightingReportSlots);
                if (result > 0) wins++;
                else if (result === 0) wins += 0.5;
            }
            let winRate = unknownPool.length > 0 ? wins / unknownPool.length : 0;
            let futureValue = strategicFutureValue(player.hand, i, sightingReportSlots);
            let value = winRate * 1000 + futureValue;
            if (value > bestValue) {
                bestValue = value;
                bestCardIdx = i;
            }
        }
    } else if (player.aiStrategy === 'strategic') {
        let bestValue = -Infinity;
        for (let i = 0; i < player.hand.length; i++) {
            let cardScore = scoreCardForSlots(player.hand[i], sightingReportSlots);
            let futureValue = strategicFutureValue(player.hand, i, sightingReportSlots);
            let value = cardScore + futureValue;
            if (value > bestValue) {
                bestValue = value;
                bestCardIdx = i;
            }
        }
    } else {
        let maxSlots = lazyMaxSlots(player.aiStrategy);
        let maxScore = -1;
        for (let i = 0; i < player.hand.length; i++) {
            let score = scoreCardForSlots(player.hand[i], sightingReportSlots, maxSlots);
            if (score > maxScore) {
                maxScore = score;
                bestCardIdx = i;
            }
        }
    }

    let card = player.hand[bestCardIdx];
    player.hand.splice(bestCardIdx, 1);
    return card;
}

// --- Evaluate phase ---
function evaluateSighting(players, playedCards, sightingReportSlots) {
    players.forEach(p => p.wonLastSighting = false);
    let activeCards = [...playedCards];

    for (let slot = 0; slot < 6; slot++) {
        if (activeCards.length <= 1) break;
        let r = sightingReportSlots[slot];
        if (!r) continue;

        let matching = activeCards.filter(ac => ac.card.traits[r.tileIndex] === r.side);
        if (matching.length > 0 && matching.length < activeCards.length) {
            activeCards = matching;
        }
    }

    let winner = players[activeCards[0].playerIdx];
    winner.score += 1;
    winner.wonLastSighting = true;
    return winner;
}

// --- Draft phase ---
function runDraftPhase(players, starterIdx, sightingReportSlots, expeditionSeenCards) {
    let n = players.length;
    let baseOrder = [];
    for (let i = 0; i < n; i++) baseOrder.push((starterIdx + i) % n);

    let draftOrder;
    if (n === 2) {
        draftOrder = [
            { p: baseOrder[0], s: 5 }, { p: baseOrder[1], s: 4 },
            { p: baseOrder[0], s: 3 }, { p: baseOrder[1], s: 2 },
            { p: baseOrder[0], s: 1 }, { p: baseOrder[1], s: 0 }
        ];
    } else if (n === 3) {
        draftOrder = [
            { p: baseOrder[0], s: 5 }, { p: baseOrder[0], s: 4 },
            { p: baseOrder[1], s: 3 }, { p: baseOrder[1], s: 2 },
            { p: baseOrder[2], s: 1 }, { p: baseOrder[2], s: 0 }
        ];
    } else if (n === 4) {
        draftOrder = [
            { p: baseOrder[0], s: 5 }, { p: baseOrder[0], s: 4 },
            { p: baseOrder[1], s: 3 }, { p: baseOrder[1], s: 2 },
            { p: baseOrder[2], s: 1 }, { p: baseOrder[3], s: 0 }
        ];
    } else if (n === 5) {
        draftOrder = [
            { p: baseOrder[0], s: 5 }, { p: baseOrder[0], s: 4 },
            { p: baseOrder[1], s: 3 }, { p: baseOrder[2], s: 2 },
            { p: baseOrder[3], s: 1 }, { p: baseOrder[4], s: 0 }
        ];
    }

    let availableTiles = [0, 1, 2, 3, 4, 5];
    for (let turn of draftOrder) {
        let player = players[turn.p];
        let choice = aiDraftChoice(player, turn.s, availableTiles, sightingReportSlots, expeditionSeenCards);
        sightingReportSlots[turn.s] = choice;
        availableTiles = availableTiles.filter(t => t !== choice.tileIndex);
    }
}

// --- Alter phase ---
function runAlterPhase(players, sightingReportSlots, expeditionSeenCards) {
    let winnerIdx = players.findIndex(p => p.wonLastSighting);
    if (winnerIdx === -1) winnerIdx = 0;

    let order = [];
    for (let i = 0; i < players.length; i++) {
        order.push((winnerIdx + i) % players.length);
    }

    let lastAction = null;
    for (let pid of order) {
        let player = players[pid];
        let action = aiAlterChoice(player, lastAction, sightingReportSlots, expeditionSeenCards);

        if (action.type === 'flip') {
            lastAction = { type: 'flip', slotIdx: action.slotIdx };
            sightingReportSlots[action.slotIdx].side = 1 - sightingReportSlots[action.slotIdx].side;
        } else if (action.type === 'swap') {
            lastAction = { type: 'swap', slot1: action.slot1, slot2: action.slot2 };
            let temp = sightingReportSlots[action.slot1];
            sightingReportSlots[action.slot1] = sightingReportSlots[action.slot2];
            sightingReportSlots[action.slot2] = temp;
        }
    }
}

// --- Propose phase ---
function runProposePhase(players, sightingReportSlots, expeditionSeenCards) {
    let playedCards = [];
    for (let p of players) {
        let card = aiProposeCard(p, sightingReportSlots, expeditionSeenCards);
        playedCards.push({ playerIdx: p.id, card });
    }
    return playedCards;
}

// --- Run one expedition ---
function runExpedition(players, draftStarterIdx) {
    let deck = [...DECK];
    for (let i = deck.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    for (let p of players) {
        p.hand = [];
        for (let i = 0; i < CARDS_PER_HAND; i++) {
            p.hand.push(deck.pop());
        }
    }

    let sightingReportSlots = Array(6).fill(null);
    let expeditionSeenCards = [];
    runDraftPhase(players, draftStarterIdx, sightingReportSlots, expeditionSeenCards);

    for (let s = 1; s <= CARDS_PER_HAND; s++) {
        if (s > 1) {
            runAlterPhase(players, sightingReportSlots, expeditionSeenCards);
        }
        let playedCards = runProposePhase(players, sightingReportSlots, expeditionSeenCards);
        evaluateSighting(players, playedCards, sightingReportSlots);
        // Track played cards for card counting
        for (let pc of playedCards) expeditionSeenCards.push(pc.card);
    }
}

// --- Run one full game ---
function runGame(strategyAssignment) {
    let players = strategyAssignment.map((strategy, i) => ({
        id: i,
        name: strategy,
        aiStrategy: strategy,
        score: 0,
        hand: [],
        wonLastSighting: false
    }));

    let starterIdx = Math.floor(Math.random() * players.length);
    let maxExpeditions = 50;

    for (let exp = 0; exp < maxExpeditions; exp++) {
        runExpedition(players, starterIdx);

        let maxScore = Math.max(...players.map(p => p.score));
        let leaders = players.filter(p => p.score === maxScore);

        if (maxScore >= WIN_SCORE && leaders.length === 1) {
            return leaders[0].aiStrategy;
        } else if (maxScore >= WIN_SCORE && leaders.length > 1) {
            starterIdx = leaders[0].id;
            continue;
        } else {
            starterIdx = leaders[0].id;
        }
    }
    let maxScore = Math.max(...players.map(p => p.score));
    let leaders = players.filter(p => p.score === maxScore);
    return leaders[0].aiStrategy;
}

// --- Main simulation ---
function runSimulation() {
    let mode = process.argv[3] || '2p';
    let numPlayers = parseInt(mode) || 2;

    if (numPlayers === 2) {
        console.log(`Simulating ${NUM_GAMES} games per matchup (2-player H2H)...\n`);

        console.log('=== Head-to-Head Matchups (2-player) ===\n');

        let h2hResults = [];

        for (let i = 0; i < STRATEGIES.length; i++) {
            for (let j = i + 1; j < STRATEGIES.length; j++) {
                let s1 = STRATEGIES[i], s2 = STRATEGIES[j];
                let wins = {};
                wins[s1] = 0;
                wins[s2] = 0;

                for (let g = 0; g < NUM_GAMES; g++) {
                    let assignment = g % 2 === 0 ? [s1, s2] : [s2, s1];
                    let winner = runGame(assignment);
                    wins[winner]++;
                }

                let pct1 = (wins[s1] / NUM_GAMES * 100).toFixed(1);
                let pct2 = (wins[s2] / NUM_GAMES * 100).toFixed(1);
                h2hResults.push({ s1, s2, pct1, pct2, wins1: wins[s1], wins2: wins[s2] });
                console.log(`  ${s1.padEnd(12)} vs ${s2.padEnd(12)} => ${s1}: ${pct1}%  ${s2}: ${pct2}%`);
            }
        }

        console.log('\n=== Average H2H Win Rate ===\n');
        let stratWins = {};
        let stratGames = {};
        for (let s of STRATEGIES) { stratWins[s] = 0; stratGames[s] = 0; }
        for (let r of h2hResults) {
            stratWins[r.s1] += r.wins1; stratGames[r.s1] += NUM_GAMES;
            stratWins[r.s2] += r.wins2; stratGames[r.s2] += NUM_GAMES;
        }
        let ranking = STRATEGIES.map(s => ({ s, pct: stratWins[s] / stratGames[s] * 100 }))
            .sort((a, b) => b.pct - a.pct);
        for (let r of ranking) {
            console.log(`  ${r.s.padEnd(12)} ${r.pct.toFixed(1)}%`);
        }
        console.log();
    } else {
        // N-player mode: test each strategy against (N-1) copies of each other strategy
        console.log(`Simulating ${NUM_GAMES} games per matchup (${numPlayers}-player)...\n`);

        console.log(`=== 1 vs ${numPlayers - 1} (one strategy against ${numPlayers - 1} copies of another) ===\n`);

        let results = [];

        for (let i = 0; i < STRATEGIES.length; i++) {
            for (let j = 0; j < STRATEGIES.length; j++) {
                if (i === j) continue;
                let solo = STRATEGIES[i];
                let pack = STRATEGIES[j];
                let wins = 0;

                for (let g = 0; g < NUM_GAMES; g++) {
                    // Rotate the solo player's seat position
                    let seatIdx = g % numPlayers;
                    let assignment = Array(numPlayers).fill(pack);
                    assignment[seatIdx] = solo;
                    let winner = runGame(assignment);
                    if (winner === solo) wins++;
                }

                let pct = (wins / NUM_GAMES * 100).toFixed(1);
                let expected = (1 / numPlayers * 100).toFixed(1);
                results.push({ solo, pack, pct: parseFloat(pct), wins });
                console.log(`  ${solo.padEnd(12)} vs ${numPlayers - 1}x ${pack.padEnd(12)} => ${solo} wins ${pct}% (expected if equal: ${expected}%)`);
            }
        }

        console.log(`\n=== Average Win Rate (across all opponent matchups) ===\n`);
        let stratWins = {};
        let stratGames = {};
        for (let s of STRATEGIES) { stratWins[s] = 0; stratGames[s] = 0; }
        for (let r of results) {
            stratWins[r.solo] += r.wins;
            stratGames[r.solo] += NUM_GAMES;
        }
        let ranking = STRATEGIES.map(s => ({ s, pct: stratWins[s] / stratGames[s] * 100 }))
            .sort((a, b) => b.pct - a.pct);
        for (let r of ranking) {
            console.log(`  ${r.s.padEnd(12)} ${r.pct.toFixed(1)}%`);
        }
        console.log();
    }
}

let start = Date.now();
runSimulation();
let elapsed = ((Date.now() - start) / 1000).toFixed(1);
console.log(`Done in ${elapsed}s`);
