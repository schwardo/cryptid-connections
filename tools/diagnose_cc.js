#!/usr/bin/env node
// Diagnose CardCounter vs Greedy: find games where they make different choices and CC loses

const CARDS_PER_HAND = 7;
const WIN_SCORE = 10;

const DECK = [];
for (let i = 0; i < 64; i++) {
    let binary = i.toString(2).padStart(6, '0');
    DECK.push({ id: i, traits: binary.split('').map(b => parseInt(b)) });
}

const CATEGORIES = ['Head', 'Eyes', 'Mouth', 'Hands', 'Skin', 'Tail'];
const SIDES = [
    ['Horns', 'Fin'], ['Beady', 'Compound'], ['Fangs', 'Beak'],
    ['Webbed', 'Claws'], ['Fur', 'Scales'], ['Spiked', 'Tentacles']
];

function traitName(tileIndex, side) {
    return SIDES[tileIndex][side];
}

function cardDesc(card) {
    return `#${card.id.toString().padStart(2,'0')} [${card.traits.join('')}]`;
}

function slotsDesc(slots) {
    return slots.map((s, i) => s ? `${i+1}:${traitName(s.tileIndex, s.side)}` : `${i+1}:empty`).join(' ');
}

function scoreCardForSlots(card, slots, maxSlots) {
    let limit = maxSlots || 6;
    let score = 0;
    for (let slot = 0; slot < limit; slot++) {
        let r = slots[slot];
        if (!r) continue;
        if (card.traits[r.tileIndex] === r.side) score += (1 << (5 - slot));
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

// Returns { chosenIdx, details[] } for each strategy
function analyzePropose(hand, slots, expeditionSeenCards) {
    let results = {};

    // Greedy
    let greedyIdx = 0, greedyMax = -1;
    let greedyDetails = [];
    for (let i = 0; i < hand.length; i++) {
        let score = scoreCardForSlots(hand[i], slots);
        greedyDetails.push({ card: hand[i], score });
        if (score > greedyMax) { greedyMax = score; greedyIdx = i; }
    }
    results.greedy = { chosenIdx: greedyIdx, details: greedyDetails };

    // CardCounter
    let knownIds = new Set(hand.map(c => c.id).concat(expeditionSeenCards.map(c => c.id)));
    let unknownPool = DECK.filter(c => !knownIds.has(c.id));
    let ccIdx = 0, ccBest = -Infinity;
    let ccDetails = [];
    for (let i = 0; i < hand.length; i++) {
        let card = hand[i];
        let wins = 0;
        for (let opp of unknownPool) {
            let result = pairwiseResult(card, opp, slots);
            if (result > 0) wins++;
            else if (result === 0) wins += 0.5;
        }
        let winRate = unknownPool.length > 0 ? wins / unknownPool.length : 0;
        let futureValue = strategicFutureValue(hand, i, slots);
        let value = winRate * 1000 + futureValue;
        let greedyScore = scoreCardForSlots(card, slots);
        ccDetails.push({ card, winRate, futureValue, value, greedyScore });
        if (value > ccBest) { ccBest = value; ccIdx = i; }
    }
    results.cardcounter = { chosenIdx: ccIdx, details: ccDetails, unknownPoolSize: unknownPool.length };

    return results;
}

// Simplified game runner that traces interesting sightings
function aiDraftChoice(player, slotIdx, availableTiles) {
    if (player.hand.length > 0) {
        let bestTile = -1, bestSide = -1, maxMatches = -1;
        for (let t of availableTiles) {
            let s0 = player.hand.filter(c => c.traits[t] === 0).length;
            let s1 = player.hand.filter(c => c.traits[t] === 1).length;
            if (s0 > maxMatches) { maxMatches = s0; bestTile = t; bestSide = 0; }
            if (s1 > maxMatches) { maxMatches = s1; bestTile = t; bestSide = 1; }
        }
        return { tileIndex: bestTile, side: bestSide };
    }
    let idx = Math.floor(Math.random() * availableTiles.length);
    return { tileIndex: availableTiles[idx], side: Math.floor(Math.random() * 2) };
}

function aiAlterChoice(player, lastAction, slots) {
    // Use strategic-style alter for both
    let bestMove = { type: 'skip' };
    let bestScore = bestCardScore(player.hand, slots);
    let bestTiebreak = -Infinity;

    function evaluateCandidate(simSlots) {
        let primary = bestCardScore(player.hand, simSlots);
        let scores = player.hand.map(c => scoreCardForSlots(c, simSlots)).sort((a, b) => b - a);
        let top2Avg = (scores[0] + (scores[1] || 0)) / Math.min(2, scores.length);
        let allCardTotal = 0;
        for (let i = 0; i < 64; i++) allCardTotal += scoreCardForSlots(DECK[i], simSlots);
        return { primary, tiebreak: top2Avg - allCardTotal / 64 };
    }

    bestTiebreak = evaluateCandidate(slots).tiebreak;

    function tryMove(simSlots, move) {
        let { primary, tiebreak } = evaluateCandidate(simSlots);
        if (primary > bestScore || (primary === bestScore && tiebreak > bestTiebreak)) {
            bestScore = primary; bestTiebreak = tiebreak; bestMove = move;
        }
    }

    for (let i = 0; i < 6; i++) {
        if (!slots[i]) continue;
        if (lastAction && lastAction.type === 'flip' && lastAction.slotIdx === i) continue;
        let sim = JSON.parse(JSON.stringify(slots));
        sim[i].side = 1 - sim[i].side;
        tryMove(sim, { type: 'flip', slotIdx: i });
    }
    if (slots.every(s => s !== null)) {
        for (let i = 0; i < 6; i++) {
            for (let j = i + 1; j < 6; j++) {
                if (lastAction && lastAction.type === 'swap' && ((lastAction.slot1 === i && lastAction.slot2 === j) || (lastAction.slot1 === j && lastAction.slot2 === i))) continue;
                let sim = JSON.parse(JSON.stringify(slots));
                let temp = sim[i]; sim[i] = sim[j]; sim[j] = temp;
                tryMove(sim, { type: 'swap', slot1: i, slot2: j });
            }
        }
    }
    return bestMove;
}

// Run games and find divergences
let found = 0;
let gamesRun = 0;
let TARGET = 10;
let totalSightings = 0;
let disagreements = 0;
let sameOutcome = 0;

while (gamesRun < 20000) {
    gamesRun++;

    // Set up 2 players with same hand (simulate both strategies on same game state)
    let deck = [...DECK];
    for (let i = deck.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    let hand1 = []; // "greedy" player
    let hand2 = []; // "cardcounter" player (opponent)
    for (let i = 0; i < CARDS_PER_HAND; i++) hand1.push(deck.pop());
    for (let i = 0; i < CARDS_PER_HAND; i++) hand2.push(deck.pop());

    // Draft - both players draft with same logic
    let slots = Array(6).fill(null);
    let p1 = { hand: [...hand1], aiStrategy: 'greedy' };
    let p2 = { hand: [...hand2], aiStrategy: 'cardcounter' };

    // 2-player draft order
    let avail = [0,1,2,3,4,5];
    let draftOrder = [
        { p: p1, s: 5 }, { p: p2, s: 4 },
        { p: p1, s: 3 }, { p: p2, s: 2 },
        { p: p1, s: 1 }, { p: p2, s: 0 }
    ];
    for (let turn of draftOrder) {
        let choice = aiDraftChoice(turn.p, turn.s, avail);
        slots[turn.s] = choice;
        avail = avail.filter(t => t !== choice.tileIndex);
    }

    let expeditionSeenCards = [];

    // Play sightings
    for (let s = 1; s <= CARDS_PER_HAND; s++) {
        if (s > 1) {
            // Alter phase - p1 goes first (simplify: both use strategic alter)
            let lastAction = null;
            let action1 = aiAlterChoice(p1, lastAction, slots);
            if (action1.type === 'flip') {
                lastAction = action1;
                slots[action1.slotIdx].side = 1 - slots[action1.slotIdx].side;
            } else if (action1.type === 'swap') {
                lastAction = action1;
                let temp = slots[action1.slot1]; slots[action1.slot1] = slots[action1.slot2]; slots[action1.slot2] = temp;
            }
            let action2 = aiAlterChoice(p2, lastAction, slots);
            if (action2.type === 'flip') {
                slots[action2.slotIdx].side = 1 - slots[action2.slotIdx].side;
            } else if (action2.type === 'swap') {
                let temp = slots[action2.slot1]; slots[action2.slot1] = slots[action2.slot2]; slots[action2.slot2] = temp;
            }
        }

        // Analyze what each strategy would pick
        totalSightings++;
        let analysis = analyzePropose(p1.hand, slots, expeditionSeenCards);
        let greedyChoice = analysis.greedy.chosenIdx;
        let ccChoice = analysis.cardcounter.chosenIdx;

        // What does the opponent play? (greedy from their hand)
        let oppMax = -1, oppIdx = 0;
        for (let i = 0; i < p2.hand.length; i++) {
            let sc = scoreCardForSlots(p2.hand[i], slots);
            if (sc > oppMax) { oppMax = sc; oppIdx = i; }
        }
        let oppCard = p2.hand[oppIdx];

        if (greedyChoice !== ccChoice) {
            disagreements++;
            // They disagree! See who would win
            let greedyCard = p1.hand[greedyChoice];
            let ccCard = p1.hand[ccChoice];

            // Who wins each matchup?
            let greedyVsOpp = pairwiseResult(greedyCard, oppCard, slots);
            let ccVsOpp = pairwiseResult(ccCard, oppCard, slots);

            if (greedyVsOpp !== ccVsOpp) {
                found++;
                printDivergence(found, gamesRun, s, slots, expeditionSeenCards, analysis, p1, greedyChoice, ccChoice, oppCard, oppMax, greedyCard, ccCard, greedyVsOpp, ccVsOpp);
            } else {
                sameOutcome++;
                // Print first 5 "same outcome" disagreements to understand why CC picks differently
                if (sameOutcome <= 5) {
                    console.log(`\n${'- '.repeat(35)}`);
                    console.log(`DISAGREEMENT (same outcome) #${sameOutcome} (game ${gamesRun}, sighting ${s})`);
                    console.log(`Sighting Report: ${slotsDesc(slots)}`);
                    console.log(`Seen cards: ${expeditionSeenCards.length} (unknown pool: ${analysis.cardcounter.unknownPoolSize})`);
                    console.log(`\nPlayer hand:`);
                    for (let i = 0; i < p1.hand.length; i++) {
                        let cc = analysis.cardcounter.details[i];
                        let gr = analysis.greedy.details[i];
                        let marker = '';
                        if (i === greedyChoice) marker += ' <-- GREEDY';
                        if (i === ccChoice) marker += ' <-- CC';
                        console.log(`  ${cardDesc(p1.hand[i])}  greedyScore=${gr.score.toString().padStart(2)}  winRate=${(cc.winRate*100).toFixed(1)}%  future=${cc.futureValue}${marker}`);
                    }
                    console.log(`\nOpponent plays: ${cardDesc(oppCard)} (score=${oppMax})`);
                    console.log(`Both cards ${greedyVsOpp > 0 ? 'WIN' : greedyVsOpp < 0 ? 'LOSE' : 'TIE'} against opponent`);
                }
            }
        }

        // Both actually play greedy choice (to keep game state consistent for tracing)
        let playedCard1 = p1.hand[greedyChoice];
        let playedCard2 = p2.hand[oppIdx];
        p1.hand.splice(greedyChoice, 1);
        p2.hand.splice(oppIdx, 1);
        expeditionSeenCards.push(playedCard1, playedCard2);
    }
}

function printDivergence(n, game, s, slots, seen, analysis, p1, gi, ci, oppCard, oppMax, gc, cc, gr, cr) {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`DIVERGENCE #${n} (game ${game}, sighting ${s})`);
    console.log(`${'='.repeat(70)}`);
    console.log(`Sighting Report: ${slotsDesc(slots)}`);
    console.log(`Seen cards: ${seen.length} (unknown pool: ${analysis.cardcounter.unknownPoolSize})`);
    console.log(`\nPlayer hand:`);
    for (let i = 0; i < p1.hand.length; i++) {
        let ccd = analysis.cardcounter.details[i];
        let grd = analysis.greedy.details[i];
        let marker = '';
        if (i === gi) marker += ' <-- GREEDY';
        if (i === ci) marker += ' <-- CC';
        console.log(`  ${cardDesc(p1.hand[i])}  greedyScore=${grd.score.toString().padStart(2)}  winRate=${(ccd.winRate*100).toFixed(1)}%  future=${ccd.futureValue}${marker}`);
    }
    console.log(`\nOpponent plays: ${cardDesc(oppCard)} (score=${oppMax})`);
    console.log(`Greedy card ${cardDesc(gc)}: ${gr > 0 ? 'WIN' : gr < 0 ? 'LOSE' : 'TIE'}`);
    console.log(`CC     card ${cardDesc(cc)}: ${cr > 0 ? 'WIN' : cr < 0 ? 'LOSE' : 'TIE'}`);
}

console.log(`\n\n${'='.repeat(70)}`);
console.log(`SUMMARY`);
console.log(`${'='.repeat(70)}`);
console.log(`Games: ${gamesRun}`);
console.log(`Total sightings analyzed: ${totalSightings}`);
console.log(`Disagreements (CC picked different card): ${disagreements} (${(disagreements/totalSightings*100).toFixed(1)}%)`);
console.log(`  Same outcome despite different card: ${sameOutcome}`);
console.log(`  Different outcome: ${found}`);
