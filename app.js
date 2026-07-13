/* ==========================================================================
   Aegisnest Analytics — app.js
   Vanilla JS + GSAP. Loads 01_01_2007-13_07_2026.csv, computes a running
   equity curve, renders it into the dashboard, then plays a single
   orchestrated GSAP entrance timeline.
   ========================================================================== */

(() => {
  'use strict';

  const CSV_PATH = '01_01_2007-13_07_2026.csv';
  const STARTING_BALANCE = 200.00;
  const RECENT_TRADES_COUNT = 20;

  const CANVAS_WIDTH = 1080;
  const CANVAS_HEIGHT = 1920;

  // Chart drawing area, matches the SVG viewBox in index.html (0 0 1000 560)
  const CHART_VIEW_WIDTH = 1000;
  const CHART_VIEW_HEIGHT = 560;
  const CHART_PADDING_TOP = 40;
  const CHART_PADDING_BOTTOM = 30;

  const dom = {};

  /* ------------------------------------------------------------------------
     Boot
     ------------------------------------------------------------------------ */

  document.addEventListener('DOMContentLoaded', () => {
    cacheDom();
    initScaling();

    loadTrades(CSV_PATH)
      .then((trades) => {
        const equityCurve = buildEquityCurve(trades);
        renderHero(equityCurve);
        renderChart(equityCurve);
        renderTradeLedger(equityCurve);
        playEntranceTimeline();
      })
      .catch((err) => {
        console.error('Aegisnest Analytics — failed to load trade data:', err);
      });
  });

  function cacheDom() {
    dom.canvasWrapper = document.getElementById('canvas-wrapper');
    dom.watermark = document.getElementById('watermark');
    dom.topHeader = document.getElementById('top-header');
    dom.hero = document.getElementById('hero');
    dom.heroValueNumber = document.getElementById('hero-value-number');
    dom.heroDelta = document.getElementById('hero-delta');
    dom.heroDeltaArrow = document.getElementById('hero-delta-arrow');
    dom.heroDeltaValue = document.getElementById('hero-delta-value');
    dom.heroRangeLabel = document.getElementById('hero-range-label');
    dom.chartPanel = document.getElementById('chart-panel');
    dom.chartTradeCount = document.getElementById('chart-trade-count');
    dom.equitySvg = document.getElementById('equity-svg');
    dom.equityAreaPath = document.getElementById('equity-area-path');
    dom.equityLinePath = document.getElementById('equity-line-path');
    dom.equityCursorDot = document.getElementById('equity-cursor-dot');
    dom.tradesPanel = document.getElementById('trades-panel');
    dom.tradesList = document.getElementById('trades-list');
  }

  /* ------------------------------------------------------------------------
     Mathematical mobile scaling (bypasses Safari / Android transform bugs)
     ------------------------------------------------------------------------ */

  function initScaling() {
    applyScale();
    window.addEventListener('resize', applyScale);
    window.addEventListener('orientationchange', applyScale);
  }

  function applyScale() {
    const scale = Math.min(1, window.innerWidth / CANVAS_WIDTH, window.innerHeight / CANVAS_HEIGHT);
    const xOffset = (window.innerWidth - (CANVAS_WIDTH * scale)) / 2;
    const yOffset = (window.innerHeight - (CANVAS_HEIGHT * scale)) / 2;

    dom.canvasWrapper.style.transformOrigin = 'top left';
    dom.canvasWrapper.style.transform = `translate(${xOffset}px, ${yOffset}px) scale(${scale})`;
  }

  /* ------------------------------------------------------------------------
     CSV loading + parsing
     ------------------------------------------------------------------------ */

  async function loadTrades(path) {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error(`Could not fetch ${path} — HTTP ${response.status}`);
    }
    const rawText = await response.text();
    return parseCsv(rawText);
  }

  function parseCsv(rawText) {
    const lines = rawText
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);

    if (lines.length < 2) return [];

    const headers = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
    const ticketIdx = headers.indexOf('ticket');
    const closingTimeIdx = headers.indexOf('closing_time_utc');
    const typeIdx = headers.indexOf('type');
    const profitIdx = headers.indexOf('profit');
    const symbolIdx = headers.indexOf('symbol');

    const trades = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i]);
      if (cols.length < headers.length) continue;

      const profit = parseFloat(cols[profitIdx]);
      const closingTime = new Date(cols[closingTimeIdx]);

      if (Number.isNaN(profit) || Number.isNaN(closingTime.getTime())) continue;

      trades.push({
        ticket: cols[ticketIdx].trim(),
        closingTime,
        type: cols[typeIdx].trim().toLowerCase(),
        profit,
        symbol: symbolIdx > -1 ? cols[symbolIdx].trim().toUpperCase() : '—',
      });
    }

    return trades;
  }

  // Handles simple quoted fields (commas inside quotes) without a full CSV grammar.
  function splitCsvLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  /* ------------------------------------------------------------------------
     Equity curve math
     ------------------------------------------------------------------------ */

  function buildEquityCurve(trades) {
    const sorted = [...trades].sort((a, b) => a.closingTime - b.closingTime);

    let runningBalance = STARTING_BALANCE;

    return sorted.map((trade) => {
      runningBalance += trade.profit;
      return {
        ...trade,
        balance: runningBalance,
      };
    });
  }

  /* ------------------------------------------------------------------------
     Hero rendering
     ------------------------------------------------------------------------ */

  function renderHero(equityCurve) {
    if (equityCurve.length === 0) return;

    const finalBalance = equityCurve[equityCurve.length - 1].balance;
    const netChange = finalBalance - STARTING_BALANCE;
    const percentChange = (netChange / STARTING_BALANCE) * 100;
    const isPositive = netChange >= 0;

    dom.heroValueNumber.dataset.finalValue = finalBalance.toFixed(2);
    dom.heroValueNumber.textContent = formatMoney(0);

    dom.heroDelta.classList.toggle('is-negative', !isPositive);
    dom.heroDeltaArrow.textContent = isPositive ? '▲' : '▼';
    dom.heroDeltaValue.textContent = `${isPositive ? '+' : ''}${percentChange.toFixed(2)}%`;

    const firstDate = equityCurve[0].closingTime;
    const lastDate = equityCurve[equityCurve.length - 1].closingTime;
    dom.heroRangeLabel.textContent = `${formatDateShort(firstDate)} — ${formatDateShort(lastDate)}`;

    dom.chartTradeCount.textContent = `${equityCurve.length} TRADES`;
  }

  function formatMoney(value) {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  }

  function formatDateShort(date) {
    return date
      .toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
      .toUpperCase()
      .replace(',', '');
  }

  /* ------------------------------------------------------------------------
     Chart rendering — dynamic Y boundaries, no hardcoded min/max
     ------------------------------------------------------------------------ */

  function renderChart(equityCurve) {
    if (equityCurve.length === 0) return;

    const balances = equityCurve.map((point) => point.balance);
    const minBalance = Math.min(...balances, STARTING_BALANCE);
    const maxBalance = Math.max(...balances, STARTING_BALANCE);

    // Small vertical breathing room so the line/glow never touches the edges.
    const range = maxBalance - minBalance || 1;
    const paddedMin = minBalance - range * 0.08;
    const paddedMax = maxBalance + range * 0.08;
    const paddedRange = paddedMax - paddedMin || 1;

    const usableHeight = CHART_VIEW_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;
    const stepX = CHART_VIEW_WIDTH / (equityCurve.length - 1 || 1);

    const points = equityCurve.map((point, index) => {
      const x = index * stepX;
      const normalized = (point.balance - paddedMin) / paddedRange;
      const y = CHART_PADDING_TOP + (usableHeight - normalized * usableHeight);
      return { x, y };
    });

    const linePath = buildSmoothPath(points);
    const areaPath = `${linePath} L ${CHART_VIEW_WIDTH} ${CHART_VIEW_HEIGHT} L 0 ${CHART_VIEW_HEIGHT} Z`;

    dom.equityLinePath.setAttribute('d', linePath);
    dom.equityAreaPath.setAttribute('d', areaPath);

    const lastPoint = points[points.length - 1];
    dom.equityCursorDot.setAttribute('cx', lastPoint.x);
    dom.equityCursorDot.setAttribute('cy', lastPoint.y);

    // Prime the draw-on animation using the path's real measured length.
    const pathLength = dom.equityLinePath.getTotalLength();
    dom.equityLinePath.style.strokeDasharray = `${pathLength}`;
    dom.equityLinePath.style.strokeDashoffset = `${pathLength}`;
    dom.equityLinePath.dataset.length = pathLength;
  }

  // Catmull-Rom to cubic-bezier smoothing so the equity line reads as an
  // organic curve rather than a jagged polyline.
  function buildSmoothPath(points) {
    if (points.length < 2) {
      return points.length === 1 ? `M ${points[0].x} ${points[0].y}` : '';
    }

    let d = `M ${points[0].x} ${points[0].y}`;

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i - 1] || points[i];
      const p1 = points[i];
      const p2 = points[i + 1];
      const p3 = points[i + 2] || p2;

      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;

      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
    }

    return d;
  }

  /* ------------------------------------------------------------------------
     Recent trades ledger
     ------------------------------------------------------------------------ */

  function renderTradeLedger(equityCurve) {
    const recent = equityCurve.slice(-RECENT_TRADES_COUNT).reverse();

    dom.tradesList.innerHTML = '';

    recent.forEach((trade) => {
      const row = document.createElement('div');
      row.className = 'trade-row';

      const isBuy = trade.type === 'buy';
      const isPositive = trade.profit >= 0;

      row.innerHTML = `
        <span class="trade-symbol">${trade.symbol}</span>
        <span class="trade-action ${isBuy ? 'trade-action--buy' : 'trade-action--sell'}">${isBuy ? 'BUY' : 'SELL'}</span>
        <span class="trade-pnl ${isPositive ? 'trade-pnl--pos' : 'trade-pnl--neg'}">${isPositive ? '+' : '-'}$${formatMoney(Math.abs(trade.profit))}</span>
      `;

      dom.tradesList.appendChild(row);
    });
  }

  /* ------------------------------------------------------------------------
     GSAP entrance timeline — organic, human-led easing throughout
     ------------------------------------------------------------------------ */

  function playEntranceTimeline() {
    const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    gsap.set([dom.topHeader, dom.hero, dom.chartPanel, dom.tradesPanel], { autoAlpha: 0 });
    gsap.set(dom.chartPanel, { y: 40 });
    gsap.set(dom.tradesPanel, { y: 60 });
    gsap.set(dom.watermark, { autoAlpha: 0, scale: 1.08 });

    const tradeRows = dom.tradesList.querySelectorAll('.trade-row');
    gsap.set(tradeRows, { autoAlpha: 0, x: -24 });

    tl.to(dom.watermark, {
      autoAlpha: 1,
      scale: 1,
      duration: 1.4,
      ease: 'power2.out',
    })
      .to(dom.topHeader, {
        autoAlpha: 1,
        duration: 0.7,
        ease: 'power2.out',
      }, 0.15)
      .to(dom.hero, {
        autoAlpha: 1,
        duration: 0.9,
        ease: 'power2.out',
      }, 0.3)
      .to(dom.heroValueNumber, {
        duration: 1.6,
        ease: 'power3.inOut',
        textContent: dom.heroValueNumber.dataset.finalValue,
        snap: { textContent: 0.01 },
        onUpdate() {
          const current = parseFloat(this.targets()[0].textContent);
          dom.heroValueNumber.textContent = formatMoney(current);
        },
      }, 0.5)
      .to(dom.chartPanel, {
        autoAlpha: 1,
        y: 0,
        duration: 1,
        ease: 'power3.out',
      }, 0.6)
      .to(dom.equityLinePath, {
        strokeDashoffset: 0,
        duration: 1.8,
        ease: 'power2.inOut',
      }, 0.9)
      .fromTo(dom.equityAreaPath, {
        autoAlpha: 0,
      }, {
        autoAlpha: 1,
        duration: 1.4,
        ease: 'power2.out',
      }, 0.9)
      .fromTo(dom.equityCursorDot, {
        scale: 0,
        transformOrigin: 'center',
      }, {
        scale: 1,
        duration: 0.6,
        ease: 'back.out(2)',
      }, 2.5)
      .to(dom.tradesPanel, {
        autoAlpha: 1,
        y: 0,
        duration: 0.9,
        ease: 'power3.out',
      }, 1.1)
      .to(tradeRows, {
        autoAlpha: 1,
        x: 0,
        duration: 0.7,
        ease: 'power2.out',
        stagger: 0.12,
      }, 1.5);
  }
})();
