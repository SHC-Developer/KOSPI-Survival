const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

// ============== 상수 정의 ==============
const TICKS_PER_DAY = 1800;
const DT = 1 / TICKS_PER_DAY;
const SQRT_DT = Math.sqrt(DT);
const BLUECHIP_TICK_CAP = 0.02;
const THEME_TICK_CAP = 0.08;
const DAILY_UPPER_LIMIT = 1.30;
const DAILY_LOWER_LIMIT = 0.70;

// 30분(1800초) 동안 1초마다 업데이트 = 1일
const MARKET_DURATION = 1800; // 30분 = 1800초 = 1일
const NEWS_INTERVAL = 60; // 1분(60틱)마다 뉴스 이벤트

// 거래정지 및 상장폐지 상수
const TRADING_HALT_DURATION = 300; // 5분 = 300틱
const DELISTING_PRICE = 500; // 상장폐지 가격 기준
const DELISTING_WARNING_PRICE = 1000; // 상장폐지 위험 경고 가격 기준
const RELISTING_DAYS = 7; // 재상장까지의 일수

// 종목 설정 (4개: 대형주 2개 + 작전주 2개)
const STOCK_CONFIGS = [
  { id: '1', name: '삼성전자', type: 'bluechip', initialPrice: 72000, meanPrice: 75000, kappa: 0.02, sigma: 0.03, jumpIntensity: 0.3 },
  { id: '2', name: 'SK하이닉스', type: 'bluechip', initialPrice: 185000, meanPrice: 190000, kappa: 0.025, sigma: 0.04, jumpIntensity: 0.35 },
  { id: '3', name: '퀀텀바이오', type: 'theme', initialPrice: 8500, meanPrice: 7000, kappa: 0.05, sigma: 0.15, jumpIntensity: 0.4 },
  { id: '4', name: 'AI솔루션', type: 'theme', initialPrice: 15200, meanPrice: 12000, kappa: 0.06, sigma: 0.18, jumpIntensity: 0.45 },
];

// 가짜 뉴스 확률 (30%)
const FAKE_NEWS_PROBABILITY = 0.3;

// 뉴스 템플릿
const NEWS_TEMPLATES = {
  GOOD: [
    "{name}, 분기 실적 예상치 크게 상회",
    "{name}, 대규모 수주 계약 체결",
    "{name}, 신규 사업 진출 발표",
    "{name}, 기관 매수세 급증",
    "{name}, 외국인 대량 매수 포착",
    "{name}, 정부 지원 사업 선정",
    "{name}, 신기술 특허 취득",
    "{name}, 해외 진출 성공",
    "{name}, 배당금 대폭 인상 예고",
    "{name}, M&A 성사 임박",
  ],
  BAD: [
    "{name}, 분기 실적 예상치 크게 하회",
    "{name}, 대규모 리콜 발표",
    "{name}, 핵심 인력 대거 이탈",
    "{name}, 기관 매도세 급증",
    "{name}, 외국인 대량 매도 포착",
    "{name}, 규제 당국 조사 착수",
    "{name}, 경쟁사에 시장 점유율 잠식",
    "{name}, 주요 고객사 계약 해지",
    "{name}, 분식회계 의혹 제기",
    "{name}, 경영진 비리 혐의",
  ],
};

// ============== 유틸리티 함수 ==============

// Box-Muller 변환을 이용한 정규분포 난수 생성
function gaussianRandom() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

// 호가 단위 계산
function getTickSize(price) {
  if (price >= 500000) return 1000;
  if (price >= 100000) return 500;
  if (price >= 50000) return 100;
  if (price >= 10000) return 50;
  if (price >= 5000) return 10;
  if (price >= 1000) return 5;
  return 1;
}

// 호가 반올림
function roundToTickSize(price) {
  const tickSize = getTickSize(price);
  return Math.round(price / tickSize) * tickSize;
}

// OU 프로세스 가격 업데이트
function updatePriceOU(stock, config) {
  const isBluechip = config.type === 'bluechip';
  const tickCap = isBluechip ? BLUECHIP_TICK_CAP : THEME_TICK_CAP;
  
  const logPrice = Math.log(stock.currentPrice);
  const logMean = Math.log(config.meanPrice);
  
  const tickSigma = config.sigma * SQRT_DT;
  
  // OU 프로세스
  const meanReversion = config.kappa * (logMean - logPrice) * DT;
  const randomNoise = tickSigma * gaussianRandom();
  const trendContribution = (stock.trendNoise || 0) * tickSigma * 0.3;
  
  let logReturn = meanReversion + randomNoise + trendContribution;
  
  // 캡 적용
  const logCap = Math.log(1 + tickCap);
  logReturn = Math.max(-logCap, Math.min(logCap, logReturn));
  
  let newPrice = Math.exp(logPrice + logReturn);
  newPrice = roundToTickSize(newPrice);
  newPrice = Math.max(newPrice, 100);
  
  // 상하한가 적용
  if (newPrice >= stock.upperLimit) {
    newPrice = stock.upperLimit;
  } else if (newPrice <= stock.lowerLimit) {
    newPrice = stock.lowerLimit;
  }
  
  return newPrice;
}

// 초기 주가 데이터 생성
function getInitialPrices() {
  const prices = {};
  STOCK_CONFIGS.forEach(config => {
    prices[config.id] = {
      currentPrice: config.initialPrice,
      previousClose: config.initialPrice,
      openPrice: config.initialPrice,
      upperLimit: Math.round(config.initialPrice * DAILY_UPPER_LIMIT),
      lowerLimit: Math.round(config.initialPrice * DAILY_LOWER_LIMIT),
      trendNoise: (Math.random() - 0.5) * 2,
      // 거래정지 관련
      tradingHalted: false,
      haltedUntilTick: null,
      haltedAtTick: null, // 거래정지 시작 틱 (타이머 계산용)
      haltReason: null, // 'upper' | 'lower' | null
      // 상장폐지 관련
      isDelisted: false,
      delistedAtDay: null,
      delistingWarning: false,
    };
  });
  return prices;
}

// 뉴스 이벤트 생성
function generateNewsEvent(stock, config, gameTick, currentDay) {
  const isGood = Math.random() > 0.5;
  const templates = isGood ? NEWS_TEMPLATES.GOOD : NEWS_TEMPLATES.BAD;
  const template = templates[Math.floor(Math.random() * templates.length)];
  
  // 가짜 뉴스 여부 (30% 확률)
  const isFakeNews = Math.random() < FAKE_NEWS_PROBABILITY;
  
  // 점프 크기 결정
  let jumpPercent;
  if (config.type === 'bluechip') {
    jumpPercent = (0.05 + Math.random() * 0.15) * config.jumpIntensity;
  } else {
    jumpPercent = (0.20 + Math.random() * 0.40) * config.jumpIntensity;
  }
  
  if (!isGood) jumpPercent = -jumpPercent;
  
  // 가짜 뉴스인 경우: 역방향 또는 효과 감소
  let actualJumpPercent = jumpPercent;
  if (isFakeNews) {
    const fakeEffect = Math.random();
    if (fakeEffect < 0.5) {
      actualJumpPercent = -jumpPercent * (0.3 + Math.random() * 0.5);
    } else {
      actualJumpPercent = jumpPercent * (Math.random() * 0.2);
    }
  }
  
  // 3~5초 후 적용 (3~5틱 후)
  const delayTicks = 3 + Math.floor(Math.random() * 3); // 3, 4, 5 중 랜덤
  const applyAtTick = gameTick + delayTicks;
  
  return {
    id: `news-${gameTick}-${config.id}`,
    time: gameTick,
    day: currentDay,
    title: template.replace("{name}", config.name),
    description: isGood 
      ? `${config.name}에 대한 강력한 매수 신호가 포착되었습니다.`
      : `${config.name}에 대한 투자 주의가 필요합니다.`,
    effect: isGood ? 'GOOD' : 'BAD',
    targetStockId: config.id,
    jumpPercent: actualJumpPercent * 100,
    isFakeNews: isFakeNews,
    displayedEffect: isGood ? 'GOOD' : 'BAD',
    applyAtTick: applyAtTick, // 몇 틱 후에 적용할지
  };
}

// 뉴스 점프 적용
function applyNewsJump(stock, jumpPercent) {
  let newPrice = stock.currentPrice * (1 + jumpPercent / 100);
  newPrice = roundToTickSize(newPrice);
  
  if (newPrice >= stock.upperLimit) {
    newPrice = stock.upperLimit;
  } else if (newPrice <= stock.lowerLimit) {
    newPrice = stock.lowerLimit;
  }
  
  return newPrice;
}

// sleep 함수
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============== 30분 루프 실행 함수 (공통 로직) ==============
async function runMarketLoop(loopId) {
  const cycleStartTime = Date.now();
  
  try {
    // 현재 주가 가져오기
    let stockDoc = await db.doc('game/stockPrices').get();
    let prices = stockDoc.exists ? stockDoc.data().prices : getInitialPrices();
    let gameTick = stockDoc.exists ? (stockDoc.data().gameTick || 0) : 0;
    let currentDay = stockDoc.exists ? (stockDoc.data().currentDay || 1) : 1;
    
    // 새로운 장 시작 - 전일 종가 업데이트
    console.log(`=== [${loopId}] Day ${currentDay} Market Open ===`);
    STOCK_CONFIGS.forEach(config => {
      const stock = prices[config.id];
      
      // 상장폐지된 종목 재상장 체크 (7일 후)
      if (stock.isDelisted && stock.delistedAtDay !== null) {
        if (currentDay - stock.delistedAtDay >= RELISTING_DAYS) {
          // 재상장: 초기 가격으로 복구
          console.log(`[${loopId}] ${config.name} 재상장 (Day ${currentDay})`);
          prices[config.id] = {
            ...stock,
            currentPrice: config.initialPrice,
            previousClose: config.initialPrice,
            openPrice: config.initialPrice,
            upperLimit: Math.round(config.initialPrice * DAILY_UPPER_LIMIT),
            lowerLimit: Math.round(config.initialPrice * DAILY_LOWER_LIMIT),
            isDelisted: false,
            delistedAtDay: null,
            delistingWarning: false,
            tradingHalted: false,
            haltedUntilTick: null,
            haltedAtTick: null,
            haltReason: null,
            trendNoise: (Math.random() - 0.5) * 2,
          };
          return;
        }
      }
      
      // 새로운 날 시작 시 거래정지 해제 및 상하한가 리셋
      const newPrevClose = stock.isDelisted ? stock.currentPrice : stock.currentPrice;
      prices[config.id] = {
        ...stock,
        previousClose: newPrevClose,
        openPrice: stock.isDelisted ? stock.currentPrice : newPrevClose,
        upperLimit: stock.isDelisted ? stock.upperLimit : Math.round(newPrevClose * DAILY_UPPER_LIMIT),
        lowerLimit: stock.isDelisted ? stock.lowerLimit : Math.round(newPrevClose * DAILY_LOWER_LIMIT),
        tradingHalted: false, // 새로운 날 시작 시 거래정지 해제
        haltedUntilTick: null,
        haltedAtTick: null,
        haltReason: null,
        trendNoise: (Math.random() - 0.5) * 2,
      };
    });
    
    // 장 개장 상태 저장
    await db.doc('game/stockPrices').set({
      prices,
      gameTick,
      currentDay,
      isMarketClosed: false,
      marketClosingMessage: null,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    // 30분(1800초) 동안 매초 업데이트
    for (let tick = 0; tick < MARKET_DURATION; tick++) {
      const targetTime = cycleStartTime + (tick * 1000);
      
      // 서버 상태 확인 (100틱마다) - 중간에 서버가 중지되면 루프 종료
      if (tick % 100 === 0) {
        const serverDoc = await db.doc('game/serverStatus').get();
        const serverData = serverDoc.exists ? serverDoc.data() : { isRunning: false };
        if (!serverData.isRunning) {
          console.log(`[${loopId}] Server stopped during loop at tick ${tick}. Exiting.`);
          return;
        }
        // loopId 확인 - 다른 루프가 시작되었으면 이 루프 종료
        if (serverData.currentLoopId && serverData.currentLoopId !== loopId) {
          console.log(`[${loopId}] New loop started (${serverData.currentLoopId}). Exiting old loop.`);
          return;
        }
      }
      
      // 뉴스 이벤트 체크 (1분마다)
      const isNewsTime = tick > 0 && tick % NEWS_INTERVAL === 0;
      
      if (isNewsTime) {
        console.log(`[${loopId}] News event at tick ${tick}`);
        
        const newsStockCount = Math.floor(Math.random() * 2) + 1;
        const shuffledConfigs = [...STOCK_CONFIGS].sort(() => Math.random() - 0.5);
        const selectedConfigs = shuffledConfigs.slice(0, newsStockCount);
        
        const newsEvents = selectedConfigs.map(config => {
          const stock = prices[config.id];
          return generateNewsEvent(stock, config, gameTick, currentDay);
        });
        
        // 뉴스 저장 (즉시 반영하지 않고 applyAtTick에 저장)
        await db.doc('game/newsEvents').set({
          events: newsEvents,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // 뉴스 점프는 applyAtTick에 도달했을 때 적용 (아래에서 처리)
      }
      
      // 1. 먼저 기본 OU 프로세스 주가 업데이트
      STOCK_CONFIGS.forEach(config => {
        const stock = prices[config.id];
        
        // 상장폐지된 종목은 업데이트 안함 (가격 고정)
        if (stock.isDelisted) {
          return;
        }
        
        // 거래정지 해제 체크
        let tradingHalted = stock.tradingHalted || false;
        let haltedUntilTick = stock.haltedUntilTick || null;
        let haltedAtTick = stock.haltedAtTick || null;
        let haltReason = stock.haltReason || null;
        
        if (tradingHalted && haltedUntilTick !== null && gameTick >= haltedUntilTick) {
          // 거래정지 해제
          console.log(`[${loopId}] ${config.name} 거래정지 해제 (tick ${gameTick})`);
          tradingHalted = false;
          haltedUntilTick = null;
          haltedAtTick = null;
          haltReason = null;
        }
        
        // 거래정지 중이면 가격 변동 없음
        if (tradingHalted) {
          return;
        }
        
        const newPrice = updatePriceOU(stock, config);
        
        let newTrendNoise = stock.trendNoise || 0;
        if (tick % 180 === 0) {
          const targetTrend = (Math.random() - 0.5) * 2;
          newTrendNoise = newTrendNoise * 0.3 + targetTrend * 0.7;
        }
        
        let finalPrice = newPrice;
        
        // 상장폐지 위험 경고 체크 (1000원 이하)
        let delistingWarning = finalPrice <= DELISTING_WARNING_PRICE && finalPrice > DELISTING_PRICE;
        
        // 상장폐지 체크 (500원 미만)
        let isDelisted = false;
        let delistedAtDay = stock.delistedAtDay || null;
        
        if (finalPrice < DELISTING_PRICE) {
          if (!stock.isDelisted) {
            console.log(`[${loopId}] ${config.name} 상장폐지 (가격: ${finalPrice.toFixed(0)}원, Day ${currentDay})`);
            isDelisted = true;
            delistedAtDay = currentDay;
          }
          finalPrice = DELISTING_PRICE; // 최종 가격은 500원으로 고정
        }
        
        // 상/하한가 도달 체크 (상장폐지되지 않은 경우만)
        if (!isDelisted && !stock.isDelisted) {
          if (finalPrice >= stock.upperLimit) {
            finalPrice = stock.upperLimit;
            // 상한가 도달 시 5분 거래정지
            if (!tradingHalted) {
              tradingHalted = true;
              haltedUntilTick = gameTick + TRADING_HALT_DURATION;
              haltedAtTick = gameTick;
              haltReason = 'upper';
              console.log(`[${loopId}] ${config.name} 상한가 도달 - 5분 거래정지 (tick ${gameTick})`);
            }
          } else if (finalPrice <= stock.lowerLimit) {
            finalPrice = stock.lowerLimit;
            // 하한가 도달 시 5분 거래정지
            if (!tradingHalted) {
              tradingHalted = true;
              haltedUntilTick = gameTick + TRADING_HALT_DURATION;
              haltedAtTick = gameTick;
              haltReason = 'lower';
              console.log(`[${loopId}] ${config.name} 하한가 도달 - 5분 거래정지 (tick ${gameTick})`);
            }
          }
        }
        
        prices[config.id] = {
          ...stock,
          currentPrice: finalPrice,
          trendNoise: newTrendNoise,
          tradingHalted: tradingHalted,
          haltedUntilTick: haltedUntilTick,
          haltedAtTick: haltedAtTick,
          haltReason: haltReason,
          isDelisted: isDelisted || stock.isDelisted,
          delistedAtDay: delistedAtDay || stock.delistedAtDay,
          delistingWarning: delistingWarning,
        };
      });
      
      // 2. 3~5초 지연 후 적용할 뉴스 점프 체크 (OU 업데이트 후 최종 가격에 적용)
      const newsDoc = await db.doc('game/newsEvents').get();
      if (newsDoc.exists) {
        const allNewsEvents = newsDoc.data().events || [];
        const pendingJumps = allNewsEvents.filter(news => 
          news.applyAtTick === gameTick && !news.jumpApplied
        );
        
        if (pendingJumps.length > 0) {
          console.log(`[${loopId}] Applying ${pendingJumps.length} news jumps at tick ${gameTick} (3~5초 지연 후)`);
          
          // 뉴스 점프 적용 (OU 업데이트된 가격 기준)
          pendingJumps.forEach(news => {
            const config = STOCK_CONFIGS.find(c => c.id === news.targetStockId);
            if (config) {
              const stock = prices[config.id];
              
              // 상장폐지되었거나 거래정지 중이면 뉴스 점프 적용 안함
              if (stock.isDelisted || stock.tradingHalted) {
                return;
              }
              
              const newPrice = applyNewsJump(stock, news.jumpPercent);
              
              // 뉴스 점프 후 상/하한가 체크
              let finalPrice = newPrice;
              let tradingHalted = stock.tradingHalted || false;
              let haltedUntilTick = stock.haltedUntilTick || null;
              let haltedAtTick = stock.haltedAtTick || null;
              let haltReason = stock.haltReason || null;
              
              if (finalPrice >= stock.upperLimit) {
                finalPrice = stock.upperLimit;
                if (!tradingHalted) {
                  tradingHalted = true;
                  haltedUntilTick = gameTick + TRADING_HALT_DURATION;
                  haltedAtTick = gameTick;
                  haltReason = 'upper';
                  console.log(`[${loopId}] ${config.name} 뉴스 후 상한가 도달 - 5분 거래정지`);
                }
              } else if (finalPrice <= stock.lowerLimit) {
                finalPrice = stock.lowerLimit;
                if (!tradingHalted) {
                  tradingHalted = true;
                  haltedUntilTick = gameTick + TRADING_HALT_DURATION;
                  haltedAtTick = gameTick;
                  haltReason = 'lower';
                  console.log(`[${loopId}] ${config.name} 뉴스 후 하한가 도달 - 5분 거래정지`);
                }
              }
              
              // 상장폐지 체크
              let isDelisted = stock.isDelisted || false;
              let delistedAtDay = stock.delistedAtDay || null;
              let delistingWarning = finalPrice <= DELISTING_WARNING_PRICE && finalPrice > DELISTING_PRICE;
              
              if (finalPrice < DELISTING_PRICE && !isDelisted) {
                isDelisted = true;
                delistedAtDay = currentDay;
                finalPrice = DELISTING_PRICE;
                console.log(`[${loopId}] ${config.name} 뉴스 후 상장폐지 (가격: ${finalPrice.toFixed(0)}원)`);
              }
              
              prices[config.id] = {
                ...stock,
                currentPrice: finalPrice,
                tradingHalted: tradingHalted,
                haltedUntilTick: haltedUntilTick,
                haltedAtTick: haltedAtTick,
                haltReason: haltReason,
                isDelisted: isDelisted,
                delistedAtDay: delistedAtDay,
                delistingWarning: delistingWarning,
              };
            }
          });
          
          // 적용 완료 표시
          const updatedEvents = allNewsEvents.map(news => 
            pendingJumps.some(p => p.id === news.id)
              ? { ...news, jumpApplied: true }
              : news
          );
          
          await db.doc('game/newsEvents').update({
            events: updatedEvents
          });
        }
      }
      
      gameTick++;
      
      // Firebase에 저장
      await db.doc('game/stockPrices').set({
        prices,
        gameTick,
        currentDay,
        isMarketClosed: false,
        dayProgress: Math.round((tick / MARKET_DURATION) * 100),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // 다음 틱까지 대기
      if (tick < MARKET_DURATION - 1) {
        const nextTargetTime = cycleStartTime + ((tick + 1) * 1000);
        const waitTime = Math.max(0, nextTargetTime - Date.now());
        if (waitTime > 0) {
          await sleep(waitTime);
        }
      }
    }
    
    // 장 마감 처리
    currentDay++;
    
    await db.doc('game/stockPrices').set({
      prices,
      gameTick,
      currentDay,
      isMarketClosed: true,
      marketClosingMessage: "📢 장이 마감되었습니다. 잠시 후 다음 장이 개장합니다.",
      dayProgress: 100,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
    
    const totalElapsed = Date.now() - cycleStartTime;
    console.log(`=== [${loopId}] Day ${currentDay - 1} Market Closed === Duration: ${Math.round(totalElapsed / 1000)}s`);
    
  } catch (error) {
    console.error(`[${loopId}] Error in market loop:`, error);
    
    try {
      await db.doc('game/stockPrices').update({
        isMarketClosed: true,
        marketClosingMessage: "⚠️ 서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
      });
    } catch (e) {
      console.error(`[${loopId}] Failed to update error state:`, e);
    }
  }
}

// ============== Cloud Functions ==============

// Cloud Scheduler: 30분마다 백업용으로 실행 (이미 루프가 실행 중이면 skip)
exports.updateStockPrices = onSchedule({
  schedule: "*/30 * * * *",
  timeZone: "Asia/Seoul",
  region: "asia-northeast3",
  timeoutSeconds: 540, // 9분 (scheduled function 최대 timeout)
  memory: "512MiB",
}, async (event) => {
  try {
    // 서버 상태 확인
    const serverDoc = await db.doc('game/serverStatus').get();
    const serverData = serverDoc.exists ? serverDoc.data() : { isRunning: false };
    
    if (!serverData.isRunning) {
      console.log('[Scheduler] Server is stopped. Skipping.');
      return;
    }
    
    // 현재 루프가 실행 중인지 확인 (최근 2분 이내에 업데이트가 있었으면 실행 중으로 간주)
    const stockDoc = await db.doc('game/stockPrices').get();
    if (stockDoc.exists) {
      const lastUpdated = stockDoc.data().lastUpdated?.toDate();
      if (lastUpdated) {
        const timeSinceUpdate = Date.now() - lastUpdated.getTime();
        if (timeSinceUpdate < 120000) { // 2분 이내
          console.log('[Scheduler] Market loop is already running. Skipping.');
          return;
        }
      }
    }
    
    // 루프가 실행 중이지 않으면 새 루프 ID 생성하고 시작
    const loopId = `scheduler-${Date.now()}`;
    await db.doc('game/serverStatus').update({
      currentLoopId: loopId,
      loopStartedAt: admin.firestore.FieldValue.serverTimestamp()
    });
    
    console.log(`[Scheduler] Starting backup market loop: ${loopId}`);
    
    // 참고: Scheduler 함수는 9분 timeout이므로 전체 30분 루프를 실행할 수 없음
    // 이 함수는 toggleServer가 실패했을 때 백업용으로만 사용됨
    // 실제로는 toggleServer에서 시작된 루프가 30분 전체를 처리함
    
  } catch (error) {
    console.error('[Scheduler] Error:', error);
  }
});

// 서버 시작/중지 (Admin용) - 시작 시 즉시 30분 루프 실행
exports.toggleServer = onCall({
  region: "asia-northeast3",
  timeoutSeconds: 2100, // 35분 (HTTP callable은 최대 60분 지원)
  memory: "512MiB",
}, async (request) => {
  // 인증 확인
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const adminEmails = ['bluesangh@gmail.com'];
  const userEmail = request.auth.token.email;
  
  if (!adminEmails.includes(userEmail)) {
    throw new HttpsError('permission-denied', 'Only admin can toggle server');
  }
  
  const { action } = request.data;
  
  if (action === 'start') {
    // 고유한 루프 ID 생성
    const loopId = `manual-${Date.now()}`;
    
    // 서버 시작 상태 저장
    await db.doc('game/serverStatus').set({
      isRunning: true,
      currentLoopId: loopId,
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
      startedBy: userEmail
    });
    
    // 주가 초기화 (없으면)
    const stockDoc = await db.doc('game/stockPrices').get();
    if (!stockDoc.exists) {
      await db.doc('game/stockPrices').set({
        prices: getInitialPrices(),
        gameTick: 0,
        currentDay: 1,
        isMarketClosed: false,
        dayProgress: 0,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    
    console.log(`[toggleServer] Starting market loop: ${loopId}`);
    
    // 30분 루프 즉시 시작 (비동기로 실행하되 함수는 계속 실행됨)
    // 중요: 여기서 await를 사용하면 30분 동안 응답이 안 감
    // 대신 Promise를 시작하고 응답을 먼저 보낸 후 루프 실행
    
    // 참고: Firebase Functions에서는 응답을 보내면 함수가 종료됨
    // 따라서 루프를 완전히 실행하려면 응답을 보내지 않고 기다려야 함
    // 클라이언트는 응답을 기다리지 않도록 수정해야 함
    
    // 루프 실행 (await 사용 - 30분 동안 실행)
    await runMarketLoop(loopId);
    
    return { success: true, message: 'Server started and market loop completed', loopId };
    
  } else if (action === 'stop') {
    // 서버 중지
    await db.doc('game/serverStatus').set({
      isRunning: false,
      currentLoopId: null,
      stoppedAt: admin.firestore.FieldValue.serverTimestamp(),
      stoppedBy: userEmail
    });
    
    return { success: true, message: 'Server stopped' };
  }
  
  throw new HttpsError('invalid-argument', 'Invalid action');
});

// 서버 상태 초기화 (최초 배포 시)
exports.initializeServer = onCall({
  region: "asia-northeast3",
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const adminEmails = ['bluesangh@gmail.com'];
  const userEmail = request.auth.token.email;
  
  if (!adminEmails.includes(userEmail)) {
    throw new HttpsError('permission-denied', 'Only admin can initialize server');
  }
  
  await db.doc('game/serverStatus').set({
    isRunning: false,
    currentLoopId: null,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  await db.doc('game/stockPrices').set({
    prices: getInitialPrices(),
    gameTick: 0,
    currentDay: 1,
    isMarketClosed: false,
    dayProgress: 0,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  });
  
  await db.doc('game/newsEvents').set({
    events: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  
  return { success: true, message: 'Server initialized' };
});

// 주가 리셋 (Admin용)
exports.resetStockPrices = onCall({
  region: "asia-northeast3",
}, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const adminEmails = ['bluesangh@gmail.com'];
  const userEmail = request.auth.token.email;
  
  if (!adminEmails.includes(userEmail)) {
    throw new HttpsError('permission-denied', 'Only admin can reset stock prices');
  }
  
  await db.doc('game/stockPrices').set({
    prices: getInitialPrices(),
    gameTick: 0,
    currentDay: 1,
    isMarketClosed: false,
    dayProgress: 0,
    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
  });
  
  return { success: true, message: 'Stock prices reset' };
});
