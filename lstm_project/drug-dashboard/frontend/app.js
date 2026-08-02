// Client-side Application State
let state = {
    currentDataset: 'top100', // 'top100' or 'shortlist'
    allCandidates: [],
    filteredCandidates: [],
    selectedCandidate: null,
    filters: {
        searchSmiles: '',
        minMpo: 0.0,
        minQed: 0.0,
        maxMw: 500,
        maxLogp: 6.0,
        onlyNovel: false
    }
};

// Global Charts cache
let radarChartInstance = null;
let scatterChartInstance = null;

// DOM Elements
const btnTop100 = document.getElementById('btn-top100');
const btnShortlist = document.getElementById('btn-shortlist');
const searchSmilesInput = document.getElementById('search-smiles');
const filterMinMpo = document.getElementById('filter-min-mpo');
const filterMinQed = document.getElementById('filter-min-qed');
const filterMaxMw = document.getElementById('filter-max-mw');
const filterMaxLogp = document.getElementById('filter-max-logp');
const filterNovelty = document.getElementById('filter-novelty');

const lblMinMpo = document.getElementById('lbl-min-mpo');
const lblMinQed = document.getElementById('lbl-min-qed');
const lblMaxMw = document.getElementById('lbl-max-mw');
const lblMaxLogp = document.getElementById('lbl-max-logp');

const kpiAvgMpo = document.getElementById('kpi-avg-mpo');
const kpiCount = document.getElementById('kpi-count');
const kpiCountSub = document.getElementById('kpi-count-sub');
const kpiNovelRatio = document.getElementById('kpi-novel-ratio');

const candidatesGrid = document.getElementById('candidates-grid');
const detailCardContents = document.getElementById('detail-card-contents');
const detailTitle = document.getElementById('detail-title');

const customSmilesInput = document.getElementById('custom-smiles-input');
const btnSimulate = document.getElementById('btn-simulate');
const sandboxError = document.getElementById('sandbox-error');
const simulationOutput = document.getElementById('simulation-output');

// Initial Setup
document.addEventListener('DOMContentLoaded', () => {
    fetchCandidates();
    setupEventListeners();
});

// Event Listeners Configuration
function setupEventListeners() {
    // Dataset selectors
    btnTop100.addEventListener('click', () => switchDataset('top100'));
    btnShortlist.addEventListener('click', () => switchDataset('shortlist'));

    // Input/Filter listeners
    searchSmilesInput.addEventListener('input', (e) => {
        state.filters.searchSmiles = e.target.value.trim();
        applyFilters();
    });

    filterMinMpo.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        lblMinMpo.textContent = val.toFixed(1);
        state.filters.minMpo = val;
        applyFilters();
    });

    filterMinQed.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        lblMinQed.textContent = val.toFixed(2);
        state.filters.minQed = val;
        applyFilters();
    });

    filterMaxMw.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        lblMaxMw.textContent = val;
        state.filters.maxMw = val;
        applyFilters();
    });

    filterMaxLogp.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        lblMaxLogp.textContent = val.toFixed(1);
        state.filters.maxLogp = val;
        applyFilters();
    });

    filterNovelty.addEventListener('change', (e) => {
        state.filters.onlyNovel = e.target.checked;
        applyFilters();
    });

    // Custom molecule simulation trigger
    btnSimulate.addEventListener('click', runMoleculeSimulation);
    customSmilesInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') runMoleculeSimulation();
    });
}

// Switch Dataset
function switchDataset(datasetType) {
    if (state.currentDataset === datasetType) return;
    
    state.currentDataset = datasetType;
    
    // Manage active visual classes
    if (datasetType === 'top100') {
        btnTop100.classList.add('active');
        btnTop100.classList.remove('shortlist-active');
        btnShortlist.classList.remove('active', 'shortlist-active');
        kpiCountSub.textContent = "Top Generative Compounds";
        detailTitle.classList.remove('shortlist-color');
    } else {
        btnShortlist.classList.add('active', 'shortlist-active');
        btnTop100.classList.remove('active');
        kpiCountSub.textContent = "Docked & Filtered Shortlist";
        detailTitle.classList.add('shortlist-color');
    }

    // Reset filters visual indicators
    resetFilters();
    fetchCandidates();
}

// Reset filter state values
function resetFilters() {
    state.filters = {
        searchSmiles: '',
        minMpo: 0.0,
        minQed: 0.0,
        maxMw: 500,
        maxLogp: 6.0,
        onlyNovel: false
    };

    searchSmilesInput.value = '';
    filterMinMpo.value = 0.0;
    lblMinMpo.textContent = '0.0';
    filterMinQed.value = 0.00;
    lblMinQed.textContent = '0.00';
    filterMaxMw.value = 500;
    lblMaxMw.textContent = '500';
    filterMaxLogp.value = 6.0;
    lblMaxLogp.textContent = '6.0';
    filterNovelty.checked = false;
}

// Fetch Candidate Data
async function fetchCandidates() {
    candidatesGrid.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; padding: 4rem 0; color: var(--text-secondary);">
            <div class="loader" style="border: 3px solid rgba(255,255,255,0.05); border-top: 3px solid var(--accent-cyan); border-radius: 50%; width: 40px; height: 40px; margin: 0 auto 1rem auto; animation: spin 1s linear infinite;"></div>
            Loading screen results...
        </div>
    `;

    // Spinner CSS Animation injection
    if (!document.getElementById('spinner-style')) {
        const style = document.createElement('style');
        style.id = 'spinner-style';
        style.textContent = '@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }';
        document.head.appendChild(style);
    }

    try {
        const response = await fetch(`/api/candidates?dataset=${state.currentDataset}`);
        if (!response.ok) throw new Error("Could not retrieve candidates data.");
        
        state.allCandidates = await response.json();
        applyFilters();
        
        // Auto-select first item if candidates exist
        if (state.filteredCandidates.length > 0) {
            selectCandidate(state.filteredCandidates[0]);
        } else {
            clearDetailPanel();
        }
    } catch (err) {
        candidatesGrid.innerHTML = `
            <div class="empty-state">
                <p style="color: var(--danger);">Failed to load candidates: ${err.message}</p>
                <button onclick="fetchCandidates()" style="margin-top: 1rem; background: var(--accent-cyan); border: none; padding: 0.5rem 1rem; border-radius: 5px; color: white; cursor: pointer;">Retry</button>
            </div>
        `;
    }
}

// Apply Filters to State
function applyFilters() {
    state.filteredCandidates = state.allCandidates.filter(c => {
        // SMILES match
        const matchesSmiles = c.smiles.toLowerCase().includes(state.filters.searchSmiles.toLowerCase());
        
        // Ranges
        const matchesMpo = (c.cns_mpo_score || c.cns_mpo) >= state.filters.minMpo;
        const matchesQed = c.qed >= state.filters.minQed;
        const matchesMw = c.mol_weight <= state.filters.maxMw;
        const matchesLogp = (c.clogp || c.logp) <= state.filters.maxLogp;
        
        // Novelty
        const matchesNovel = !state.filters.onlyNovel || c.novel_vs_training;

        return matchesSmiles && matchesMpo && matchesQed && matchesMw && matchesLogp && matchesNovel;
    });

    renderCandidatesGrid();
    updateKPIs();
    updateScatterPlot();
}

// Update KPI Metrics Cards
function updateKPIs() {
    if (state.allCandidates.length === 0) return;
    
    // Average MPO score of loaded set
    const mpoKey = state.currentDataset === 'shortlist' ? 'cns_mpo_score' : 'cns_mpo_score';
    const sumMpo = state.allCandidates.reduce((acc, c) => acc + (c[mpoKey] || 0), 0);
    const avgMpo = sumMpo / state.allCandidates.length;
    kpiAvgMpo.textContent = avgMpo.toFixed(2);

    // Screened count
    kpiCount.textContent = state.allCandidates.length;

    // Novelty ratio
    const novelCount = state.allCandidates.filter(c => c.novel_vs_training).length;
    const ratio = (novelCount / state.allCandidates.length) * 100;
    kpiNovelRatio.textContent = `${ratio.toFixed(0)}%`;
}

// Render Molecule Cards Grid
function renderCandidatesGrid() {
    if (state.filteredCandidates.length === 0) {
        candidatesGrid.innerHTML = `
            <div class="empty-state">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                </svg>
                <h3>No candidates match these criteria</h3>
                <p>Try clearing some search terms or broadening the range sliders.</p>
            </div>
        `;
        return;
    }

    candidatesGrid.innerHTML = '';
    state.filteredCandidates.forEach(c => {
        const rank = c.cns_rank || c.rank;
        const score = (c.cns_mpo_score || c.cns_mpo || 0).toFixed(2);
        const activeClass = (state.selectedCandidate && (state.selectedCandidate.smiles === c.smiles)) ? 
            `selected ${state.currentDataset === 'shortlist' ? 'shortlist-selected' : ''}` : '';
        
        const card = document.createElement('div');
        card.className = `molecule-card ${activeClass}`;
        card.id = `card-${rank}`;
        card.innerHTML = `
            <div class="molecule-card-header">
                <span class="rank-badge">#${rank}</span>
                <span class="score-badge">${score}</span>
            </div>
            
            <div class="molecule-image-wrapper">
                ${c.svg || '<!-- No SVG available -->'}
            </div>

            <div class="molecule-card-details">
                <div class="molecule-smiles" title="${c.smiles}">${c.smiles}</div>
                <div class="property-tags">
                    <div class="prop-tag">MW: <strong>${Math.round(c.mol_weight)}</strong></div>
                    <div class="prop-tag">clogP: <strong>${(c.clogp || c.logp || 0).toFixed(1)}</strong></div>
                    <div class="prop-tag">TPSA: <strong>${Math.round(c.tpsa)}</strong></div>
                </div>
            </div>

            <span class="novelty-badge ${c.novel_vs_training ? 'novel' : 'training'}">
                ${c.novel_vs_training ? 'Novel' : 'Known'}
            </span>
        `;

        card.addEventListener('click', () => selectCandidate(c));
        candidatesGrid.appendChild(card);
    });
}

// Select Candidate and Open Profile
function selectCandidate(candidate) {
    state.selectedCandidate = candidate;
    
    // Highlight active card
    document.querySelectorAll('.molecule-card').forEach(el => {
        el.classList.remove('selected', 'shortlist-selected');
    });
    
    const rank = candidate.cns_rank || candidate.rank;
    const cardEl = document.getElementById(`card-${rank}`);
    if (cardEl) {
        cardEl.classList.add('selected');
        if (state.currentDataset === 'shortlist') {
            cardEl.classList.add('shortlist-selected');
        }
    }

    renderDetailPanel(candidate);
}

// Clear Detail Panel
function clearDetailPanel() {
    state.selectedCandidate = null;
    detailCardContents.innerHTML = `
        <div style="text-align: center; color: var(--text-secondary); padding: 3rem 1rem;">
            <p>Select a molecule from the grid to inspect its detailed parameters and desirability chart.</p>
        </div>
    `;
    if (radarChartInstance) {
        radarChartInstance.destroy();
        radarChartInstance = null;
    }
}

// Render Profile Details in Panel
function renderDetailPanel(c) {
    const score = (c.cns_mpo_score || c.cns_mpo || 0).toFixed(3);
    const clogp = (c.clogp || c.logp || 0).toFixed(2);
    
    // Standard MPO details or placeholder if columns missing (shortlist has same columns)
    const dClogp = (c.d_clogp !== undefined ? c.d_clogp : 1.0).toFixed(2);
    const dClogd = (c.d_clogd !== undefined ? c.d_clogd : 1.0).toFixed(2);
    const dMw = (c.d_mw !== undefined ? c.d_mw : 1.0).toFixed(2);
    const dTpsa = (c.d_tpsa !== undefined ? c.d_tpsa : 1.0).toFixed(2);
    const dHbd = (c.d_hbd !== undefined ? c.d_hbd : 1.0).toFixed(2);
    const qed = (c.qed || 0).toFixed(3);

    detailCardContents.innerHTML = `
        <div class="molecule-detail-big">
            <div class="molecule-detail-svg">
                ${c.svg}
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 0.75rem;">
                <div>
                    <h4 style="font-weight: 800; font-size: 1.15rem; color: #fff;">Candidate #${c.cns_rank || c.rank}</h4>
                    <p style="font-size: 0.75rem; color: var(--text-secondary); word-break: break-all; margin-top: 0.25rem;">
                        SMILES: <strong style="font-family: monospace; color: var(--accent-cyan);">${c.smiles}</strong>
                    </p>
                </div>
                <div class="score-badge" style="font-size: 1.15rem; padding: 0.4rem 0.8rem; background: rgba(6,182,212,0.12); border-color: rgba(6,182,212,0.3); color: var(--accent-cyan);">
                    MPO: ${score}
                </div>
            </div>

            <!-- Stats Grid -->
            <div class="detail-stats-grid">
                <div class="detail-stat-box">
                    <div class="detail-stat-label">Molecular Weight</div>
                    <div class="detail-stat-value">${c.mol_weight.toFixed(1)}</div>
                    <div class="detail-stat-desire">d = ${dMw}</div>
                </div>

                <div class="detail-stat-box">
                    <div class="detail-stat-label">CLogP (logP)</div>
                    <div class="detail-stat-value">${clogp}</div>
                    <div class="detail-stat-desire">d = ${dClogp}</div>
                </div>

                <div class="detail-stat-box">
                    <div class="detail-stat-label">Polar Surface Area</div>
                    <div class="detail-stat-value">${c.tpsa.toFixed(1)} Å²</div>
                    <div class="detail-stat-desire">d = ${dTpsa}</div>
                </div>

                <div class="detail-stat-box">
                    <div class="detail-stat-label">Drug Likeness (QED)</div>
                    <div class="detail-stat-value">${qed}</div>
                    <div class="detail-stat-desire">Desirability: Max</div>
                </div>
            </div>
        </div>

        <div style="margin-top: 1rem;">
            <div class="detail-stat-label" style="margin-bottom: 0.5rem;">CNS Desirability Profile</div>
            <div class="radar-chart-container">
                <canvas id="radar-chart"></canvas>
            </div>
        </div>
    `;

    // Render component Radar Chart
    renderRadarChart([
        c.d_clogp !== undefined ? c.d_clogp : 1.0,
        c.d_clogd !== undefined ? c.d_clogd : 1.0,
        c.d_mw !== undefined ? c.d_mw : 1.0,
        c.d_tpsa !== undefined ? c.d_tpsa : 1.0,
        c.d_hbd !== undefined ? c.d_hbd : 1.0
    ]);
}

// Chart.js Radar Chart setup
function renderRadarChart(scoresArray) {
    const ctx = document.getElementById('radar-chart').getContext('2d');
    
    if (radarChartInstance) {
        radarChartInstance.destroy();
    }

    const data = {
        labels: ['CLogP (logP)', 'CLogD (logD)', 'Mol Weight', 'TPSA (Polar)', 'H-Bond Donor'],
        datasets: [{
            label: 'Desirability (0 to 1)',
            data: scoresArray,
            fill: true,
            backgroundColor: 'rgba(20, 184, 166, 0.25)',
            borderColor: 'rgba(20, 184, 166, 1.0)',
            pointBackgroundColor: 'rgba(6, 182, 212, 1.0)',
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: 'rgba(6, 182, 212, 1.0)',
            borderWidth: 2
        }]
    };

    const config = {
        type: 'radar',
        data: data,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                r: {
                    angleLines: { color: 'rgba(255, 255, 255, 0.08)' },
                    grid: { color: 'rgba(255, 255, 255, 0.08)' },
                    pointLabels: {
                        color: 'rgba(255, 255, 255, 0.7)',
                        font: { family: 'Inter', size: 10, weight: '600' }
                    },
                    ticks: {
                        backdropColor: 'transparent',
                        color: 'rgba(255, 255, 255, 0.4)',
                        font: { size: 9 },
                        stepSize: 0.2
                    },
                    min: 0,
                    max: 1.0
                }
            }
        }
    };

    radarChartInstance = new Chart(ctx, config);
}

// Chart.js Scatter Plot setup (Chemical Space Analysis)
function updateScatterPlot() {
    const ctx = document.getElementById('scatter-chart').getContext('2d');
    
    if (scatterChartInstance) {
        scatterChartInstance.destroy();
    }

    const scatterData = state.filteredCandidates.map(c => {
        return {
            x: c.mol_weight,
            y: c.clogp || c.logp || 0,
            r: Math.max(3, (c.tpsa / 12) + 2), // size depends on TPSA
            candidate: c
        };
    });

    const dataset = {
        label: 'Candidates',
        data: scatterData,
        backgroundColor: function(context) {
            const index = context.dataIndex;
            const dataPoint = context.dataset.data[index];
            if (!dataPoint) return 'rgba(255,255,255,0.5)';
            const score = dataPoint.candidate.cns_mpo_score || dataPoint.candidate.cns_mpo || 0;
            
            // Neon color mapping based on scores
            if (score >= 4.8) return 'rgba(6, 182, 212, 0.75)';      // Neon Cyan
            if (score >= 4.5) return 'rgba(16, 185, 129, 0.75)';     // Neon Green
            if (score >= 4.0) return 'rgba(245, 158, 11, 0.75)';     // Yellow/Amber
            return 'rgba(239, 68, 68, 0.75)';                       // Neon Red
        },
        borderColor: 'rgba(255, 255, 255, 0.15)',
        borderWidth: 1,
        hoverBorderColor: '#fff',
        hoverBorderWidth: 2
    };

    const config = {
        type: 'bubble',
        data: { datasets: [dataset] },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const c = context.raw.candidate;
                            const rank = c.cns_rank || c.rank;
                            const mpo = (c.cns_mpo_score || c.cns_mpo || 0).toFixed(2);
                            return `Rank: #${rank} | MPO: ${mpo} | MW: ${c.mol_weight.toFixed(0)} | clogP: ${(c.clogp || c.logp || 0).toFixed(2)}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    title: {
                        display: true,
                        text: 'Molecular Weight (g/mol)',
                        color: 'rgba(255, 255, 255, 0.6)',
                        font: { family: 'Inter', weight: '600' }
                    },
                    ticks: { color: 'rgba(255, 255, 255, 0.5)' }
                },
                y: {
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    title: {
                        display: true,
                        text: 'Calculated CLogP',
                        color: 'rgba(255, 255, 255, 0.6)',
                        font: { family: 'Inter', weight: '600' }
                    },
                    ticks: { color: 'rgba(255, 255, 255, 0.5)' }
                }
            },
            onClick: (e) => {
                const elements = scatterChartInstance.getElementsAtEventForMode(e, 'nearest', { intersect: true }, true);
                if (elements.length > 0) {
                    const idx = elements[0].index;
                    const clickedCandidate = config.data.datasets[0].data[idx].candidate;
                    selectCandidate(clickedCandidate);
                    
                    // Scroll target card into viewport
                    const rank = clickedCandidate.cns_rank || clickedCandidate.rank;
                    const card = document.getElementById(`card-${rank}`);
                    if (card) {
                        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                }
            }
        }
    };

    scatterChartInstance = new Chart(ctx, config);
}

// Custom SMILES Sandbox Simulation Runner
async function runMoleculeSimulation() {
    const smiles = customSmilesInput.value.trim();
    if (!smiles) {
        showSandboxError("Please enter a valid SMILES string first.");
        return;
    }

    hideSandboxError();
    btnSimulate.disabled = true;
    btnSimulate.textContent = "Simulating...";

    try {
        const response = await fetch('/api/calculate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ smiles: smiles })
        });

        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || "Simulation calculations failed.");
        }

        renderSimulationResult(result);
    } catch (err) {
        showSandboxError(err.message);
        simulationOutput.style.display = 'none';
    } finally {
        btnSimulate.disabled = false;
        btnSimulate.textContent = "Simulate & Compare";
    }
}

// Display simulated sandbox output
function renderSimulationResult(res) {
    document.getElementById('sim-svg-container').innerHTML = res.svg;
    document.getElementById('sim-total-score').textContent = res.cns_mpo_score.toFixed(3);
    
    // Properties labels
    document.getElementById('sim-lbl-mw').textContent = `${res.mol_weight.toFixed(1)} g/mol (d = ${res.d_mw.toFixed(2)})`;
    document.getElementById('sim-lbl-logp').textContent = `${res.clogp.toFixed(2)} (d = ${res.d_clogp.toFixed(2)})`;
    document.getElementById('sim-lbl-tpsa').textContent = `${res.tpsa.toFixed(1)} Å² (d = ${res.d_tpsa.toFixed(2)})`;
    document.getElementById('sim-lbl-hbd').textContent = `${res.hbd} (d = ${res.d_hbd.toFixed(2)})`;

    // Progress bar animations
    document.getElementById('sim-bar-mw').style.width = `${res.d_mw * 100}%`;
    document.getElementById('sim-bar-logp').style.width = `${res.d_clogp * 100}%`;
    document.getElementById('sim-bar-tpsa').style.width = `${res.d_tpsa * 100}%`;
    document.getElementById('sim-bar-hbd').style.width = `${res.d_hbd * 100}%`;

    simulationOutput.style.display = 'grid';
    
    // Highlight bar coloring
    const bars = ['mw', 'logp', 'tpsa', 'hbd'];
    bars.forEach(b => {
        const el = document.getElementById(`sim-bar-${b}`);
        const desireVal = res[`d_${b}`];
        el.style.background = desireVal >= 0.9 ? 'var(--success)' : (desireVal >= 0.5 ? 'var(--warning)' : 'var(--danger)');
    });
}

function showSandboxError(msg) {
    sandboxError.textContent = msg;
    sandboxError.style.display = 'block';
}

function hideSandboxError() {
    sandboxError.style.display = 'none';
}
