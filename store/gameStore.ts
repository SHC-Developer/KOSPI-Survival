import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { GameState, Stock, NewsEvent, TransactionRecord, TransactionType, OrderBook, OrderLevel, PriceCandle, PageType, MarketStatus, PendingOrder } from '../types';

// 거래 수수료율 (0.1%)
const TRANSACTION_FEE_RATE = 0.001;
import { 
  STOCK_CONFIGS, 
  INITIAL_CASH, 
  NEWS_TEMPLATES,
  TICKS_PER_DAY,
  CLOSING_DURATION,
  DT,
  SQRT_DT,
  BLUECHIP_TICK_CAP,
  THEME_TICK_CAP,
  DAILY_UPPER_LIMIT,
  DAILY_LOWER_LIMIT,
  NEWS_PROBABILITY_PER_TICK,
  TREND_NOISE_UPDATE_INTERVAL
} from '../utils/constants';

const MAX_CANDLES = 200;

// 거래정지 기간 (5분 = 300틱)
const TRADING_HALT_DURATION = 300;

// 상장폐지 가격 기준
const DELISTING_PRICE = 500;

// 상장폐지 위험 경고 가격 기준
const DELISTING_WARNING_PRICE = 1000;

// 재상장까지의 기간 (7일)
const RELISTING_DAYS = 7;

// Firebase 주가 데이터 타입
interface StockPriceData {
  [stockId: string]: {
    currentPrice: number;
    previousClose: number;
    openPrice: number;
    upperLimit: number;
    lowerLimit: number;
  };
}

interface GameStore extends GameState {
  transactions: TransactionRecord[];
  realizedPnL: number;
  pendingOrders: PendingOrder[];
  latestNews: NewsEvent | null; // 가장 최근 뉴스 (팝업용)
  initialize: () => void;
  loadFromFirebase: (cash: number, portfolio: { stockId: string; quantity: number; averagePrice: number }[], gameTick: number) => void;
  getDataForFirebase: () => { cash: number; portfolio: { stockId: string; quantity: number; averagePrice: number }[]; gameTick: number };
  // 주가 Firebase 동기화
  getStockPricesForFirebase: () => StockPriceData;
  loadStockPricesFromFirebase: (prices: StockPriceData) => void;
  addPendingOrder: (order: Omit<PendingOrder, 'id' | 'createdAt' | 'createdDay'>) => void;
  cancelPendingOrder: (orderId: string) => void;
  clearLatestNews: () => void;
  sellAllStocks: () => void;
}

// Box-Muller 변환을 이용한 정규분포 난수 생성
const gaussianRandom = (): number => {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
};

// 호가 단위 계산
const getTickSize = (price: number): number => {
  if (price >= 500000) return 1000;
  if (price >= 100000) return 500;
  if (price >= 50000) return 100;
  if (price >= 10000) return 50;
  if (price >= 5000) return 10;
  if (price >= 1000) return 5;
  return 1;
};

// 호가 반올림
const roundToTickSize = (price: number): number => {
  const tickSize = getTickSize(price);
  return Math.round(price / tickSize) * tickSize;
};

// 호가창 생성
const generateOrderBook = (currentPrice: number, isBluechip: boolean): OrderBook => {
  const tickSize = getTickSize(currentPrice);
  const asks: OrderLevel[] = [];
  const bids: OrderLevel[] = [];
  
  const volumeMultiplier = isBluechip ? 5 : 1;
  
  for (let i = 1; i <= 5; i++) {
    const askPrice = roundToTickSize(currentPrice + tickSize * i);
    const bidPrice = roundToTickSize(currentPrice - tickSize * (i - 1));
    
    const askVolume = Math.floor((Math.random() * 30000 + 5000) * volumeMultiplier);
    const bidVolume = Math.floor((Math.random() * 30000 + 5000) * volumeMultiplier);
    
    asks.push({ price: askPrice, volume: askVolume });
    if (bidPrice > 0) {
      bids.push({ price: bidPrice, volume: bidVolume });
    }
  }
  
  return { asks: asks.reverse(), bids };
};

// 호가창 업데이트
const updateOrderBook = (orderBook: OrderBook, currentPrice: number, priceChange: number, isBluechip: boolean): OrderBook => {
  const tickSize = getTickSize(currentPrice);
  const volumeMultiplier = isBluechip ? 5 : 1;
  
  // 가격 변동에 따른 물량 조정 비율
  const changeRatio = priceChange > 0 ? 0.85 : 1.15;
  const oppositeRatio = priceChange > 0 ? 1.15 : 0.85;
  
  const newAsks: OrderLevel[] = [];
  const newBids: OrderLevel[] = [];
  
  for (let i = 1; i <= 5; i++) {
    const askPrice = roundToTickSize(currentPrice + tickSize * i);
    const bidPrice = roundToTickSize(currentPrice - tickSize * (i - 1));
    
    const existingAsk = orderBook.asks.find(a => Math.abs(a.price - askPrice) < tickSize);
    const existingBid = orderBook.bids.find(b => Math.abs(b.price - bidPrice) < tickSize);
    
    let askVolume = existingAsk 
      ? Math.floor(existingAsk.volume * changeRatio + (Math.random() - 0.5) * 10000 * volumeMultiplier)
      : Math.floor((Math.random() * 20000 + 3000) * volumeMultiplier);
    
    let bidVolume = existingBid
      ? Math.floor(existingBid.volume * oppositeRatio + (Math.random() - 0.5) * 10000 * volumeMultiplier)
      : Math.floor((Math.random() * 20000 + 3000) * volumeMultiplier);
    
    askVolume = Math.max(500, askVolume);
    bidVolume = Math.max(500, bidVolume);
    
    newAsks.push({ price: askPrice, volume: askVolume });
    if (bidPrice > 0) {
      newBids.push({ price: bidPrice, volume: bidVolume });
    }
  }
  
  return { asks: newAsks.reverse(), bids: newBids };
};

// 초기 캔들 생성 (히스토리)
const generateInitialCandles = (config: typeof STOCK_CONFIGS[0]): PriceCandle[] => {
  const candles: PriceCandle[] = [];
  let price = config.initialPrice;
  const dailySigma = config.sigma;
  
  // 30개의 과거 캔들 생성
  for (let i = 0; i < 30; i++) {
    const volatility = dailySigma * (0.5 + Math.random() * 0.5);
    const change = gaussianRandom() * volatility * price;
    
    const open = price;
    price = roundToTickSize(price + change);
    price = Math.max(price, 100); // 최소가
    
    const high = roundToTickSize(Math.max(open, price) * (1 + Math.random() * 0.02));
    const low = roundToTickSize(Math.min(open, price) * (1 - Math.random() * 0.02));
    const volume = Math.floor(Math.random() * 500000 + 100000);
    
    candles.push({ time: i, open, high, low, close: price, volume });
  }
  
  return candles;
};

// 초기 주식 데이터 생성
const generateInitialStocks = (): Stock[] => {
  return STOCK_CONFIGS.map(config => {
    const price = config.initialPrice;
    return {
      id: config.id,
      name: config.name,
      symbol: config.symbol,
      type: config.type,
      currentPrice: price,
      openPrice: price,
      previousClose: price,
      initialPrice: config.initialPrice,
      meanPrice: config.meanPrice,
      kappa: config.kappa,
      sigma: config.sigma,
      jumpIntensity: config.jumpIntensity,
      upperLimit: Math.round(price * DAILY_UPPER_LIMIT),
      lowerLimit: Math.round(price * DAILY_LOWER_LIMIT),
      priceFrozen: false,
      frozenAtLimit: null,
      tradingHalted: false,
      haltedUntilTick: null,
      isDelisted: false,
      delistedAtDay: null,
      delistingWarning: false,
      trendNoise: (Math.random() - 0.5) * 2, // -1 ~ 1
      trendNoiseLastUpdate: 0,
      priceHistory: generateInitialCandles(config),
      orderBook: generateOrderBook(price, config.type === 'bluechip'),
    };
  });
};

// Ornstein-Uhlenbeck 가격 업데이트
const updatePriceOU = (stock: Stock, dayTick: number): { newPrice: number; jump: number } => {
  // 상장폐지된 종목이거나 거래정지 중이면 변동 없음
  if (stock.isDelisted || stock.tradingHalted) {
    return { newPrice: stock.currentPrice, jump: 0 };
  }
  
  // 가격이 동결된 경우 변동 없음
  if (stock.priceFrozen) {
    return { newPrice: stock.currentPrice, jump: 0 };
  }
  
  const isBluechip = stock.type === 'bluechip';
  const tickCap = isBluechip ? BLUECHIP_TICK_CAP : THEME_TICK_CAP;
  
  // 로그 가격
  const logPrice = Math.log(stock.currentPrice);
  const logMean = Math.log(stock.meanPrice);
  
  // 틱 변동성 (일일 변동성을 틱 단위로 변환)
  const tickSigma = stock.sigma * SQRT_DT;
  
  // 기본 OU 프로세스 업데이트
  // dx = kappa * (mu - x) * dt + sigma * sqrt(dt) * eps
  const meanReversion = stock.kappa * (logMean - logPrice) * DT;
  const randomNoise = tickSigma * gaussianRandom();
  
  // 느린 추세 노이즈 (방향성)
  const trendContribution = stock.trendNoise * tickSigma * 0.3;
  
  // 로그 수익률 계산
  let logReturn = meanReversion + randomNoise + trendContribution;
  
  // 로그 수익률 캡 적용
  const logCap = Math.log(1 + tickCap);
  logReturn = Math.max(-logCap, Math.min(logCap, logReturn));
  
  // 새 가격 계산
  let newLogPrice = logPrice + logReturn;
  let newPrice = Math.exp(newLogPrice);
  
  // 호가 단위로 반올림
  newPrice = roundToTickSize(newPrice);
  
  // 최소가 보장
  newPrice = Math.max(newPrice, 100);
  
  // 일일 상/하한가 적용
  if (newPrice >= stock.upperLimit) {
    newPrice = stock.upperLimit;
  } else if (newPrice <= stock.lowerLimit) {
    newPrice = stock.lowerLimit;
  }
  
  return { newPrice, jump: 0 };
};

// 뉴스 이벤트 생성
const generateNewsEvent = (stock: Stock, gameTick: number, currentDay: number): NewsEvent | null => {
  // 종목별 뉴스 발생 확률 (작전주는 더 자주)
  const baseProbability = NEWS_PROBABILITY_PER_TICK;
  const probability = stock.type === 'theme' 
    ? baseProbability * 2 
    : baseProbability;
  
  if (Math.random() > probability) return null;
  
  const isGood = Math.random() > 0.5;
  const templates = isGood ? NEWS_TEMPLATES.GOOD : NEWS_TEMPLATES.BAD;
  const template = templates[Math.floor(Math.random() * templates.length)];
  
  // 점프 크기 결정
  let jumpPercent: number;
  if (stock.type === 'bluechip') {
    // 대형주: ±5% ~ ±20%
    jumpPercent = (0.05 + Math.random() * 0.15) * stock.jumpIntensity;
  } else {
    // 작전주: ±20% ~ ±60%
    jumpPercent = (0.20 + Math.random() * 0.40) * stock.jumpIntensity;
  }
  
  if (!isGood) jumpPercent = -jumpPercent;
  
  return {
    id: `news-${gameTick}-${stock.id}`,
    time: gameTick,
    day: currentDay,
    title: template.replace("{name}", stock.name),
    description: isGood 
      ? `${stock.name}에 대한 강력한 매수 신호가 포착되었습니다.`
      : `${stock.name}에 대한 투자 주의가 필요합니다.`,
    effect: isGood ? 'GOOD' : 'BAD',
    targetStockId: stock.id,
    jumpPercent: jumpPercent * 100, // 퍼센트로 저장
    resolved: false,
  };
};

// 뉴스 점프 적용
const applyNewsJump = (stock: Stock, jumpPercent: number): number => {
  if (stock.priceFrozen) return stock.currentPrice;
  
  let newPrice = stock.currentPrice * (1 + jumpPercent / 100);
  newPrice = roundToTickSize(newPrice);
  
  // 상/하한가 제한
  if (newPrice >= stock.upperLimit) {
    newPrice = stock.upperLimit;
  } else if (newPrice <= stock.lowerLimit) {
    newPrice = stock.lowerLimit;
  }
  
  return newPrice;
};

// 다음 날 시작 시 상태 초기화
const resetForNewDay = (stock: Stock, currentDay: number, config: typeof STOCK_CONFIGS[0]): Stock => {
  // 상장폐지된 종목이 재상장 기간에 도달했는지 체크
  if (stock.isDelisted && stock.delistedAtDay !== null) {
    if (currentDay - stock.delistedAtDay >= RELISTING_DAYS) {
      // 재상장: 초기 가격으로 복구
      const relistPrice = config.initialPrice;
      return {
        ...stock,
        currentPrice: relistPrice,
        previousClose: relistPrice,
        openPrice: relistPrice,
        upperLimit: Math.round(relistPrice * DAILY_UPPER_LIMIT),
        lowerLimit: Math.round(relistPrice * DAILY_LOWER_LIMIT),
        priceFrozen: false,
        frozenAtLimit: null,
        tradingHalted: false,
        haltedUntilTick: null,
        isDelisted: false,
        delistedAtDay: null,
        delistingWarning: false,
        trendNoise: (Math.random() - 0.5) * 2,
        trendNoiseLastUpdate: 0,
      };
    }
    // 아직 재상장 기간이 아니면 그대로 유지
    return stock;
  }
  
  const newPrevClose = stock.currentPrice;
  return {
    ...stock,
    previousClose: newPrevClose,
    openPrice: newPrevClose,
    upperLimit: Math.round(newPrevClose * DAILY_UPPER_LIMIT),
    lowerLimit: Math.round(newPrevClose * DAILY_LOWER_LIMIT),
    priceFrozen: false,
    frozenAtLimit: null,
    tradingHalted: false, // 새 날 시작 시 거래정지 해제
    haltedUntilTick: null,
    trendNoise: (Math.random() - 0.5) * 2, // 새로운 추세 방향
    trendNoiseLastUpdate: 0,
  };
};

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      cash: INITIAL_CASH,
      initialCash: INITIAL_CASH,
      portfolio: [],
      stocks: generateInitialStocks(),
      news: [],
      transactions: [],
      realizedPnL: 0,
      pendingOrders: [],
      latestNews: null,
      gameTick: 0,
      isPlaying: false,
      selectedStockId: '1',
      
      marketStatus: 'OPEN' as MarketStatus,
      currentDay: 1,
      dayTickCount: 0,
      closingCountdown: 0,
      
      currentPage: 'watchlist' as PageType,
      selectedOrderPrice: null,

      initialize: () => {
        if (get().stocks.length === 0) {
          set({ stocks: generateInitialStocks() });
        }
      },

      loadFromFirebase: (cash, portfolio, gameTick) => {
        // gameTick에서 currentDay와 dayTickCount 계산
        const currentDay = Math.floor(gameTick / TICKS_PER_DAY) + 1;
        const dayTickCount = gameTick % TICKS_PER_DAY;
        
        // 기존 stocks가 없으면 생성, 있으면 유지 (localStorage persist에서 복원됨)
        const currentStocks = get().stocks;
        const stocks = currentStocks.length > 0 ? currentStocks : generateInitialStocks();
        
        set({
          cash,
          portfolio,
          gameTick,
          currentDay,
          dayTickCount,
          stocks,
          marketStatus: 'OPEN' as MarketStatus,
        });
      },

      getDataForFirebase: () => {
        const { cash, portfolio, gameTick } = get();
        return { cash, portfolio, gameTick };
      },

      // 주가 데이터를 Firebase에 저장할 형태로 변환
      getStockPricesForFirebase: () => {
        const { stocks } = get();
        const prices: StockPriceData = {};
        stocks.forEach(stock => {
          prices[stock.id] = {
            currentPrice: stock.currentPrice,
            previousClose: stock.previousClose,
            openPrice: stock.openPrice,
            upperLimit: stock.upperLimit,
            lowerLimit: stock.lowerLimit,
          };
        });
        return prices;
      },

      // Firebase에서 로드한 주가 데이터를 적용
      loadStockPricesFromFirebase: (prices: StockPriceData) => {
        const { stocks } = get();
        const updatedStocks = stocks.map(stock => {
          const priceData = prices[stock.id];
          if (priceData) {
            return {
              ...stock,
              currentPrice: priceData.currentPrice,
              previousClose: priceData.previousClose,
              openPrice: priceData.openPrice,
              upperLimit: priceData.upperLimit,
              lowerLimit: priceData.lowerLimit,
            };
          }
          return stock;
        });
        set({ stocks: updatedStocks });
        console.log('[GameStore] Stock prices loaded from Firebase');
      },

      togglePlay: () => set((state) => ({ isPlaying: !state.isPlaying })),
      
      selectStock: (id) => set({ selectedStockId: id, currentPage: 'price' }),
      
      setPage: (page) => set({ currentPage: page }),
      
      setSelectedOrderPrice: (price) => set({ selectedOrderPrice: price }),

      resetGame: () => {
        set({
          cash: INITIAL_CASH,
          portfolio: [],
          stocks: generateInitialStocks(),
          news: [],
          transactions: [],
          realizedPnL: 0,
          pendingOrders: [],
          latestNews: null,
          gameTick: 0,
          isPlaying: false,
          marketStatus: 'OPEN',
          currentDay: 1,
          dayTickCount: 0,
          closingCountdown: 0,
          currentPage: 'watchlist',
        });
      },

      buyStock: (stockId, quantity, price) => {
        const { stocks, cash, portfolio, transactions, gameTick, currentDay } = get();
        const stock = stocks.find(s => s.id === stockId);
        if (!stock || quantity <= 0) return;
        
        // 상장폐지 또는 거래정지 종목은 매수 불가
        if (stock.isDelisted || stock.tradingHalted) return;

        const orderAmount = price * quantity;
        const fee = Math.round(orderAmount * TRANSACTION_FEE_RATE); // 수수료 0.1% (반올림)
        const totalCost = orderAmount + fee;
        
        if (cash >= totalCost) {
          const existingHolding = portfolio.find(p => p.stockId === stockId);
          let newPortfolio;

          if (existingHolding) {
            const totalValue = (existingHolding.quantity * existingHolding.averagePrice) + orderAmount;
            const newQuantity = existingHolding.quantity + quantity;
            newPortfolio = portfolio.map(p => 
              p.stockId === stockId 
                ? { ...p, quantity: newQuantity, averagePrice: Math.floor(totalValue / newQuantity) } 
                : p
            );
          } else {
            newPortfolio = [...portfolio, { stockId, quantity, averagePrice: price }];
          }

          set({
            cash: cash - totalCost,
            portfolio: newPortfolio,
            transactions: [
              {
                id: `tx-${Date.now()}`,
                time: gameTick,
                day: currentDay,
                type: TransactionType.BUY,
                stockName: stock.name,
                quantity,
                price,
                total: orderAmount,
                fee
              },
              ...transactions
            ].slice(0, 100)
          });
        }
      },

      sellStock: (stockId, quantity, price) => {
        const { stocks, portfolio, cash, transactions, gameTick, currentDay, realizedPnL } = get();
        const stock = stocks.find(s => s.id === stockId);
        const holding = portfolio.find(p => p.stockId === stockId);
        
        if (!stock || !holding || holding.quantity < quantity || quantity <= 0) return;
        
        // 상장폐지 또는 거래정지 종목은 매도 불가
        if (stock.isDelisted || stock.tradingHalted) return;

        const saleAmount = price * quantity;
        const fee = Math.round(saleAmount * TRANSACTION_FEE_RATE); // 수수료 0.1% (반올림)
        const totalProceeds = saleAmount - fee;
        const costBasis = holding.averagePrice * quantity;
        const profit = totalProceeds - costBasis;
        
        const newPortfolio = holding.quantity === quantity
          ? portfolio.filter(p => p.stockId !== stockId)
          : portfolio.map(p => p.stockId === stockId ? { ...p, quantity: p.quantity - quantity } : p);

        set({
          cash: cash + totalProceeds,
          portfolio: newPortfolio,
          realizedPnL: realizedPnL + profit,
          transactions: [
            {
              id: `tx-${Date.now()}`,
              time: gameTick,
              day: currentDay,
              type: TransactionType.SELL,
              stockName: stock.name,
              quantity,
              price,
              total: saleAmount,
              fee
            },
            ...transactions
          ].slice(0, 100)
        });
      },

      tick: () => {
        const { stocks, news, gameTick, marketStatus, dayTickCount, currentDay, closingCountdown } = get();
        
        // 휴장 중
        if (marketStatus === 'CLOSED') {
          if (closingCountdown > 0) {
            set({ closingCountdown: closingCountdown - 1 });
            return;
          } else {
            // 새로운 날 시작
            const updatedStocks = stocks.map(stock => {
              const config = STOCK_CONFIGS.find(c => c.id === stock.id)!;
              return resetForNewDay(stock, currentDay + 1, config);
            });
            set({
              marketStatus: 'OPEN',
              currentDay: currentDay + 1,
              dayTickCount: 0,
              stocks: updatedStocks,
            });
            return;
          }
        }
        
        // 하루 종료 체크
        if (dayTickCount >= TICKS_PER_DAY) {
          set({
            marketStatus: 'CLOSED',
            closingCountdown: CLOSING_DURATION,
          });
          return;
        }
        
        // 뉴스 이벤트 처리
        let newNews = [...news];
        const newsEvents: NewsEvent[] = [];
        
        for (const stock of stocks) {
          const newsEvent = generateNewsEvent(stock, gameTick, currentDay);
          if (newsEvent) {
            newsEvents.push(newsEvent);
            newNews = [newsEvent, ...newNews].slice(0, 30);
          }
        }
        
        // 가격 업데이트
        const updatedStocks = stocks.map(stock => {
          // 상장폐지된 종목은 업데이트 안함
          if (stock.isDelisted) {
            return stock;
          }
          
          // 거래정지 해제 체크
          let tradingHalted = stock.tradingHalted;
          let haltedUntilTick = stock.haltedUntilTick;
          let priceFrozen = stock.priceFrozen;
          let frozenAtLimit = stock.frozenAtLimit;
          
          if (tradingHalted && haltedUntilTick !== null && gameTick >= haltedUntilTick) {
            // 거래정지 해제
            tradingHalted = false;
            haltedUntilTick = null;
            priceFrozen = false;
            frozenAtLimit = null;
          }
          
          // 거래정지 중이면 가격 변동 없음
          if (tradingHalted) {
            return {
              ...stock,
              tradingHalted,
              haltedUntilTick,
            };
          }
          
          // 추세 노이즈 업데이트 (TREND_NOISE_UPDATE_INTERVAL 틱마다)
          let newTrendNoise = stock.trendNoise;
          let newTrendNoiseLastUpdate = stock.trendNoiseLastUpdate;
          
          if (dayTickCount - stock.trendNoiseLastUpdate >= TREND_NOISE_UPDATE_INTERVAL) {
            // 새 추세 방향으로 부드럽게 전환
            const targetTrend = (Math.random() - 0.5) * 2;
            newTrendNoise = stock.trendNoise * 0.3 + targetTrend * 0.7;
            newTrendNoiseLastUpdate = dayTickCount;
          }
          
          // 기본 가격 업데이트 (OU 프로세스)
          const { newPrice } = updatePriceOU({ ...stock, tradingHalted, priceFrozen }, dayTickCount);
          let finalPrice = newPrice;
          
          // 뉴스 점프 적용
          const relevantNews = newsEvents.find(n => n.targetStockId === stock.id);
          if (relevantNews && !priceFrozen) {
            finalPrice = applyNewsJump({ ...stock, currentPrice: finalPrice, priceFrozen }, relevantNews.jumpPercent);
          }
          
          // 상장폐지 위험 경고 체크 (1000원 이하)
          let delistingWarning = finalPrice <= DELISTING_WARNING_PRICE;
          
          // 상장폐지 체크 (500원 미만)
          let isDelisted = false;
          let delistedAtDay: number | null = null;
          
          if (finalPrice < DELISTING_PRICE) {
            isDelisted = true;
            delistedAtDay = currentDay;
            finalPrice = DELISTING_PRICE; // 최종 가격은 500원으로 고정
          }
          
          // 상/하한가 도달 체크
          if (!isDelisted) {
            if (finalPrice >= stock.upperLimit) {
              finalPrice = stock.upperLimit;
              // 상한가 도달 시 5분 거래정지
              if (!priceFrozen) {
                tradingHalted = true;
                haltedUntilTick = gameTick + TRADING_HALT_DURATION;
              }
              priceFrozen = true;
              frozenAtLimit = 'upper';
            } else if (finalPrice <= stock.lowerLimit) {
              finalPrice = stock.lowerLimit;
              // 하한가 도달 시 5분 거래정지
              if (!priceFrozen) {
                tradingHalted = true;
                haltedUntilTick = gameTick + TRADING_HALT_DURATION;
              }
              priceFrozen = true;
              frozenAtLimit = 'lower';
            }
          }
          
          const priceChange = finalPrice - stock.currentPrice;
          
          // 캔들 업데이트
          const lastCandle = stock.priceHistory[stock.priceHistory.length - 1];
          let newHistory = [...stock.priceHistory];
          
          // 10틱마다 새 캔들 (약 10초 = 1캔들)
          if (dayTickCount % 10 === 0) {
            const newCandle: PriceCandle = {
              time: gameTick,
              open: stock.currentPrice,
              high: Math.max(stock.currentPrice, finalPrice),
              low: Math.min(stock.currentPrice, finalPrice),
              close: finalPrice,
              volume: Math.floor(Math.random() * 50000 + 10000),
            };
            newHistory = [...newHistory, newCandle].slice(-MAX_CANDLES);
          } else if (lastCandle) {
            // 기존 캔들 업데이트
            const updatedCandle: PriceCandle = {
              ...lastCandle,
              high: Math.max(lastCandle.high, finalPrice),
              low: Math.min(lastCandle.low, finalPrice),
              close: finalPrice,
              volume: lastCandle.volume + Math.floor(Math.random() * 2000),
            };
            newHistory[newHistory.length - 1] = updatedCandle;
          }
          
          // 호가창 업데이트
          const newOrderBook = (priceFrozen || isDelisted || tradingHalted)
            ? stock.orderBook 
            : updateOrderBook(stock.orderBook, finalPrice, priceChange, stock.type === 'bluechip');
          
          return {
            ...stock,
            currentPrice: finalPrice,
            priceFrozen,
            frozenAtLimit,
            tradingHalted,
            haltedUntilTick,
            isDelisted,
            delistedAtDay,
            delistingWarning,
            trendNoise: newTrendNoise,
            trendNoiseLastUpdate: newTrendNoiseLastUpdate,
            priceHistory: newHistory,
            orderBook: newOrderBook,
          };
        });
        
        // 뉴스 resolved 처리 (점프 적용 후)
        const resolvedNews = newNews.map(n => ({
          ...n,
          resolved: newsEvents.some(ne => ne.id === n.id) ? true : n.resolved
        }));
        
        // 가장 최근 뉴스를 latestNews에 저장 (팝업용)
        const latestNewsEvent = newsEvents.length > 0 ? newsEvents[0] : null;
        
        // 예약 주문 체결 체크
        const { pendingOrders, buyStock, sellStock } = get();
        const executedOrderIds: string[] = [];
        
        for (const order of pendingOrders) {
          const orderStock = updatedStocks.find(s => s.id === order.stockId);
          if (!orderStock) continue;
          
          // 상장폐지 또는 거래정지 종목은 예약 주문 취소
          if (orderStock.isDelisted || orderStock.tradingHalted) {
            executedOrderIds.push(order.id); // 주문 제거
            continue;
          }
          
          // 매수 예약: 현재가가 목표가 이하로 떨어지면 체결
          if (order.side === 'buy' && orderStock.currentPrice <= order.targetPrice) {
            buyStock(order.stockId, order.quantity, orderStock.currentPrice);
            executedOrderIds.push(order.id);
          }
          // 매도 예약: 현재가가 목표가 이상으로 올라가면 체결
          else if (order.side === 'sell' && orderStock.currentPrice >= order.targetPrice) {
            sellStock(order.stockId, order.quantity, orderStock.currentPrice);
            executedOrderIds.push(order.id);
          }
        }
        
        const remainingOrders = pendingOrders.filter(o => !executedOrderIds.includes(o.id));
        
        set({
          stocks: updatedStocks,
          news: resolvedNews,
          gameTick: gameTick + 1,
          dayTickCount: dayTickCount + 1,
          latestNews: latestNewsEvent,
          pendingOrders: remainingOrders,
        });
      },
      
      // 예약 주문 추가
      addPendingOrder: (orderData) => {
        const { pendingOrders, gameTick, currentDay } = get();
        const newOrder: PendingOrder = {
          ...orderData,
          id: `order-${Date.now()}`,
          createdAt: gameTick,
          createdDay: currentDay,
        };
        set({ pendingOrders: [...pendingOrders, newOrder] });
      },
      
      // 예약 주문 취소
      cancelPendingOrder: (orderId) => {
        const { pendingOrders } = get();
        set({ pendingOrders: pendingOrders.filter(o => o.id !== orderId) });
      },
      
      // 최근 뉴스 클리어 (팝업 닫기용)
      clearLatestNews: () => {
        set({ latestNews: null });
      },
      
      // 전량 매도
      sellAllStocks: () => {
        const { portfolio, stocks, sellStock } = get();
        for (const item of portfolio) {
          const stock = stocks.find(s => s.id === item.stockId);
          // 상장폐지 또는 거래정지 종목은 매도 불가
          if (stock && !stock.isDelisted && !stock.tradingHalted) {
            sellStock(item.stockId, item.quantity, stock.currentPrice);
          }
        }
      }
    }),
    {
      name: 'kospi-survival-storage',
      partialize: (state) => ({ 
        cash: state.cash, 
        portfolio: state.portfolio, 
        gameTick: state.gameTick,
        currentDay: state.currentDay,
        realizedPnL: state.realizedPnL,
        pendingOrders: state.pendingOrders,
      }),
    }
  )
);
