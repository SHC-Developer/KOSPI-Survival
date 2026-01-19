import { StockType } from '../types';

export const INITIAL_CASH = 10000000; // 1,000만원

// 시간 상수
export const TICKS_PER_DAY = 1800; // 30분 = 1800초 = 1일
export const CLOSING_DURATION = 180; // 휴장 3분 = 180초

// 변동성 상수
export const DT = 1 / TICKS_PER_DAY; // 1틱 = 1/1800일
export const SQRT_DT = Math.sqrt(DT);

// 틱당 변동률 캡
export const BLUECHIP_TICK_CAP = 0.02; // ±2%
export const THEME_TICK_CAP = 0.08; // ±8%

// 일일 상하한가
export const DAILY_UPPER_LIMIT = 1.30; // +30%
export const DAILY_LOWER_LIMIT = 0.70; // -30%

// 뉴스 이벤트 확률 (하루 평균 1.5회 = 틱당 1.5/1800 확률)
export const NEWS_PROBABILITY_PER_TICK = 1.5 / TICKS_PER_DAY;

// 추세 노이즈 업데이트 주기 (약 3분마다 = 180틱)
export const TREND_NOISE_UPDATE_INTERVAL = 180;

// 종목 정의
export interface StockConfig {
  id: string;
  name: string;
  symbol: string;
  type: StockType;
  initialPrice: number;
  meanPrice: number;
  kappa: number; // 평균회귀 속도 (일 기준)
  sigma: number; // 일일 변동성
  jumpIntensity: number; // 점프 강도 (0~1, 작전주용)
}

export const STOCK_CONFIGS: StockConfig[] = [
  // 대형주 7개 (bluechip)
  {
    id: '1',
    name: '삼성전자',
    symbol: '005930',
    type: 'bluechip',
    initialPrice: 72000,
    meanPrice: 75000,
    kappa: 0.02, // 느린 평균회귀
    sigma: 0.03, // 일일 3% 변동성
    jumpIntensity: 0.1,
  },
  {
    id: '2',
    name: 'SK하이닉스',
    symbol: '000660',
    type: 'bluechip',
    initialPrice: 185000,
    meanPrice: 190000,
    kappa: 0.025,
    sigma: 0.04,
    jumpIntensity: 0.15,
  },
  {
    id: '3',
    name: 'LG전자',
    symbol: '066570',
    type: 'bluechip',
    initialPrice: 95000,
    meanPrice: 100000,
    kappa: 0.02,
    sigma: 0.035,
    jumpIntensity: 0.1,
  },
  {
    id: '4',
    name: 'NAVER',
    symbol: '035420',
    type: 'bluechip',
    initialPrice: 195000,
    meanPrice: 210000,
    kappa: 0.03,
    sigma: 0.045,
    jumpIntensity: 0.2,
  },
  {
    id: '5',
    name: '카카오',
    symbol: '035720',
    type: 'bluechip',
    initialPrice: 42000,
    meanPrice: 45000,
    kappa: 0.035,
    sigma: 0.05,
    jumpIntensity: 0.2,
  },
  {
    id: '6',
    name: '현대차',
    symbol: '005380',
    type: 'bluechip',
    initialPrice: 245000,
    meanPrice: 250000,
    kappa: 0.02,
    sigma: 0.03,
    jumpIntensity: 0.1,
  },
  {
    id: '7',
    name: 'LG화학',
    symbol: '051910',
    type: 'bluechip',
    initialPrice: 380000,
    meanPrice: 400000,
    kappa: 0.025,
    sigma: 0.04,
    jumpIntensity: 0.15,
  },
  
  // 작전주 3개 (theme)
  {
    id: '8',
    name: '퀀텀바이오',
    symbol: '900010',
    type: 'theme',
    initialPrice: 8500,
    meanPrice: 7000,
    kappa: 0.05, // 빠른 평균회귀
    sigma: 0.15, // 일일 15% 변동성
    jumpIntensity: 0.6,
  },
  {
    id: '9',
    name: 'AI솔루션',
    symbol: '900020',
    type: 'theme',
    initialPrice: 15200,
    meanPrice: 12000,
    kappa: 0.06,
    sigma: 0.18,
    jumpIntensity: 0.7,
  },
  {
    id: '10',
    name: '메타코인',
    symbol: '900030',
    type: 'theme',
    initialPrice: 4800,
    meanPrice: 4000,
    kappa: 0.07,
    sigma: 0.20, // 일일 20% 변동성
    jumpIntensity: 0.8,
  },
];

// 뉴스 템플릿
export const NEWS_TEMPLATES = {
  GOOD: [
    "{name}, 신약 임상 3상 성공 '상한가 직행'",
    "{name}, 사상 최대 실적 발표에 외국인 매수 폭발",
    "정부, {name} 관련 산업 대규모 지원책 발표",
    "{name}, 글로벌 빅테크와 전략적 제휴 발표",
    "{name}, 특허 소송 완승에 주가 급등",
    "외국계 IB, {name} 목표주가 50% 상향",
    "{name}, 신사업 진출로 성장동력 확보",
  ],
  BAD: [
    "{name}, 대규모 유상증자 발표에 '하한가 직행'",
    "{name} 공장 폭발사고... 생산 전면 중단",
    "검찰, {name} 대표이사 횡령 혐의로 구속",
    "{name}, 주요 고객사 계약 해지에 실적 급감 전망",
    "공매도 세력, {name} 집중 공격에 주가 폭락",
    "{name}, 부채비율 급증에 신용등급 하향",
    "금감원, {name} 분식회계 의혹 조사 착수",
  ]
};
