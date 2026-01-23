// 종목 타입
export type StockType = 'bluechip' | 'theme';

export interface Stock {
  id: string;
  name: string;
  symbol: string;
  type: StockType;
  
  // 가격 관련
  currentPrice: number;
  openPrice: number; // 오늘 시가
  previousClose: number; // 전일 종가
  
  // OU 모델 파라미터
  initialPrice: number; // 초기 가격
  meanPrice: number; // 장기 평균 가격 (평균회귀 타겟)
  kappa: number; // 평균회귀 속도 (0.01 ~ 0.1)
  sigma: number; // 일일 변동성 (0.03 ~ 0.20)
  jumpIntensity: number; // 점프 강도 (작전주용, 0 ~ 1)
  
  // 일일 상하한가
  upperLimit: number; // 상한가 (전일종가 * 1.3)
  lowerLimit: number; // 하한가 (전일종가 * 0.7)
  priceFrozen: boolean; // 상하한가 도달시 가격 동결
  frozenAtLimit: 'upper' | 'lower' | null; // 어느 한계에서 동결되었는지
  
  // 거래정지 시스템
  tradingHalted: boolean; // 거래 정지 상태
  haltedUntilTick: number | null; // 거래 정지 해제 틱
  
  // 상장폐지 시스템
  isDelisted: boolean; // 상장폐지 여부
  delistedAtDay: number | null; // 상장폐지된 날
  delistingWarning: boolean; // 상장폐지 위험 경고
  
  // 느린 추세 노이즈 (분 단위 방향성)
  trendNoise: number; // 현재 추세 방향 (-1 ~ 1)
  trendNoiseLastUpdate: number; // 마지막 추세 업데이트 틱
  
  // 차트 데이터
  priceHistory: PriceCandle[];
  orderBook: OrderBook;
}

// 캔들 차트용 데이터
export interface PriceCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// 호가창 데이터
export interface OrderBook {
  asks: OrderLevel[]; // 매도 호가
  bids: OrderLevel[]; // 매수 호가
}

export interface OrderLevel {
  price: number;
  volume: number;
}

export interface PortfolioItem {
  stockId: string;
  quantity: number;
  averagePrice: number;
  leverage?: number; // 레버리지 배율 (1=일반, 2/5/10/25/50=레버리지)
  entryPrice?: number; // 레버리지 진입가 (청산가 계산용)
  liquidationPrice?: number; // 청산가
}

export interface NewsEvent {
  id: string;
  time: number;
  day: number;
  title: string;
  description: string;
  effect: 'GOOD' | 'BAD';
  targetStockId: string;
  jumpPercent: number; // 실제 적용된 점프 퍼센트
  resolved: boolean;
}

// 장 상태
export type MarketStatus = 'OPEN' | 'CLOSED';

// 페이지 타입
export type PageType = 'watchlist' | 'price' | 'order' | 'portfolio' | 'ranking';

export interface GameState {
  cash: number;
  initialCash: number;
  portfolio: PortfolioItem[];
  stocks: Stock[];
  news: NewsEvent[];
  gameTick: number;
  isPlaying: boolean;
  selectedStockId: string | null;
  
  // 장 시스템
  marketStatus: MarketStatus;
  currentDay: number;
  dayTickCount: number; // 현재 일 내 틱 (0 ~ 1799)
  closingCountdown: number; // 휴장 카운트다운 (180초)
  
  // 페이지 네비게이션
  currentPage: PageType;
  selectedOrderPrice: number | null;
  
  // Actions
  tick: () => void;
  buyStock: (stockId: string, quantity: number, price: number) => void;
  sellStock: (stockId: string, quantity: number, price: number, leverage?: number) => void;
  resetGame: () => void;
  togglePlay: () => void;
  selectStock: (id: string) => void;
  setPage: (page: PageType) => void;
  setSelectedOrderPrice: (price: number | null) => void;
}

export enum TransactionType {
  BUY = '매수',
  SELL = '매도'
}

export interface TransactionRecord {
  id: string;
  time: number;
  day: number;
  type: TransactionType;
  stockName: string;
  quantity: number;
  price: number;
  total: number;
  fee: number; // 거래 수수료
}

// 예약 주문 타입
export type OrderType = 'market' | 'limit';
export type OrderSide = 'buy' | 'sell';

export interface PendingOrder {
  id: string;
  stockId: string;
  side: OrderSide;
  quantity: number;
  targetPrice: number;
  createdAt: number; // gameTick
  createdDay: number;
}
