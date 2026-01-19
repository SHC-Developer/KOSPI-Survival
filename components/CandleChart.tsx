import React, { useState, useMemo } from 'react';
import { Stock, PriceCandle } from '../types';
import { KRW } from './Formatters';

interface Props {
  stock: Stock;
  onBack: () => void;
}

type ChartType = 'day' | 'minute' | 'second';

const CandleChart: React.FC<Props> = ({ stock, onBack }) => {
  const [chartType, setChartType] = useState<ChartType>('second');
  
  const diff = stock.currentPrice - stock.previousClose;
  const rate = stock.previousClose === 0 ? 0 : (diff / stock.previousClose) * 100;
  const isUp = diff > 0;
  const colorClass = isUp ? 'text-red-500' : diff < 0 ? 'text-blue-500' : 'text-gray-400';

  // 캔들 데이터 처리
  const candles = useMemo(() => {
    const data = stock.priceHistory;
    if (chartType === 'second') {
      return data.slice(-50); // 최근 50개
    } else if (chartType === 'minute') {
      // 10개씩 묶어서 분봉 생성
      const minuteCandles: PriceCandle[] = [];
      for (let i = 0; i < data.length; i += 10) {
        const group = data.slice(i, Math.min(i + 10, data.length));
        if (group.length > 0) {
          minuteCandles.push({
            time: group[0].time,
            open: group[0].open,
            high: Math.max(...group.map(c => c.high)),
            low: Math.min(...group.map(c => c.low)),
            close: group[group.length - 1].close,
            volume: group.reduce((sum, c) => sum + c.volume, 0),
          });
        }
      }
      return minuteCandles.slice(-30);
    } else {
      // 일봉 (60개씩 = 10분 = 1일)
      const dayCandles: PriceCandle[] = [];
      for (let i = 0; i < data.length; i += 60) {
        const group = data.slice(i, Math.min(i + 60, data.length));
        if (group.length > 0) {
          dayCandles.push({
            time: group[0].time,
            open: group[0].open,
            high: Math.max(...group.map(c => c.high)),
            low: Math.min(...group.map(c => c.low)),
            close: group[group.length - 1].close,
            volume: group.reduce((sum, c) => sum + c.volume, 0),
          });
        }
      }
      return dayCandles.slice(-20);
    }
  }, [stock.priceHistory, chartType]);

  // 차트 계산
  const minPrice = Math.min(...candles.map(c => c.low));
  const maxPrice = Math.max(...candles.map(c => c.high));
  const priceRange = maxPrice - minPrice || 1;
  const maxVolume = Math.max(...candles.map(c => c.volume));

  const chartHeight = 300;
  const volumeHeight = 60;
  const candleWidth = Math.max(4, Math.floor((window.innerWidth - 80) / candles.length) - 2);

  const getY = (price: number) => {
    return chartHeight - ((price - minPrice) / priceRange) * chartHeight;
  };

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* 헤더 */}
      <header className="bg-gray-900 px-4 py-3 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="p-2 -ml-2 text-gray-400 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <h1 className="text-lg font-bold text-white">{stock.name}</h1>
          <div className="w-8" />
        </div>
        
        {/* 현재가 표시 */}
        <div className="mt-2 flex items-end gap-3">
          <span className={`text-2xl font-bold ${colorClass}`}>
            <KRW value={stock.currentPrice} />
          </span>
          <div className={`flex items-center gap-1 ${colorClass} text-sm`}>
            <span>{isUp ? '▲' : diff < 0 ? '▼' : '-'}</span>
            <span><KRW value={Math.abs(diff)} /></span>
            <span className="text-xs">({isUp ? '+' : ''}{rate.toFixed(2)}%)</span>
          </div>
        </div>
      </header>

      {/* 차트 타입 선택 */}
      <div className="flex gap-1 px-4 py-2 bg-gray-900/50 border-b border-gray-800">
        {(['day', 'minute', 'second'] as ChartType[]).map((type) => (
          <button
            key={type}
            onClick={() => setChartType(type)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              chartType === type
                ? 'bg-orange-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            {type === 'day' ? '일봉' : type === 'minute' ? '분봉' : '초봉'}
          </button>
        ))}
      </div>

      {/* 캔들 차트 */}
      <div className="flex-1 overflow-hidden p-4">
        <div className="relative h-full">
          {/* 가격 축 (오른쪽) */}
          <div className="absolute right-0 top-0 bottom-16 w-16 flex flex-col justify-between text-xs text-gray-500">
            <span><KRW value={maxPrice} /></span>
            <span><KRW value={Math.round((maxPrice + minPrice) / 2)} /></span>
            <span><KRW value={minPrice} /></span>
          </div>
          
          {/* 차트 영역 */}
          <div className="mr-16 h-full">
            {/* 캔들 차트 */}
            <svg width="100%" height={chartHeight} className="overflow-visible">
              {/* 그리드 */}
              <line x1="0" y1="0" x2="100%" y2="0" stroke="#374151" strokeDasharray="2,2" />
              <line x1="0" y1={chartHeight / 2} x2="100%" y2={chartHeight / 2} stroke="#374151" strokeDasharray="2,2" />
              <line x1="0" y1={chartHeight} x2="100%" y2={chartHeight} stroke="#374151" strokeDasharray="2,2" />
              
              {/* 전일 종가 라인 */}
              <line 
                x1="0" 
                y1={getY(stock.previousClose)} 
                x2="100%" 
                y2={getY(stock.previousClose)} 
                stroke="#6b7280" 
                strokeDasharray="4,4" 
              />
              
              {/* 캔들 */}
              {candles.map((candle, i) => {
                const x = i * (candleWidth + 2) + candleWidth / 2;
                const isGreen = candle.close >= candle.open;
                const color = isGreen ? '#ef4444' : '#3b82f6';
                const bodyTop = getY(Math.max(candle.open, candle.close));
                const bodyBottom = getY(Math.min(candle.open, candle.close));
                const bodyHeight = Math.max(1, bodyBottom - bodyTop);
                
                return (
                  <g key={i}>
                    {/* 심지 (wick) */}
                    <line
                      x1={x}
                      y1={getY(candle.high)}
                      x2={x}
                      y2={getY(candle.low)}
                      stroke={color}
                      strokeWidth={1}
                    />
                    {/* 몸통 (body) */}
                    <rect
                      x={x - candleWidth / 2}
                      y={bodyTop}
                      width={candleWidth}
                      height={bodyHeight}
                      fill={isGreen ? color : 'transparent'}
                      stroke={color}
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </svg>
            
            {/* 거래량 차트 */}
            <svg width="100%" height={volumeHeight} className="mt-2">
              {candles.map((candle, i) => {
                const x = i * (candleWidth + 2);
                const height = (candle.volume / maxVolume) * volumeHeight;
                const isGreen = candle.close >= candle.open;
                const color = isGreen ? '#ef4444' : '#3b82f6';
                
                return (
                  <rect
                    key={i}
                    x={x}
                    y={volumeHeight - height}
                    width={candleWidth}
                    height={height}
                    fill={color}
                    opacity={0.5}
                  />
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      {/* 범례 */}
      <div className="px-4 py-2 bg-gray-900/50 border-t border-gray-800 flex items-center justify-center gap-4 text-xs text-gray-500">
        <span>시: <KRW value={candles[candles.length - 1]?.open || 0} /></span>
        <span>고: <KRW value={candles[candles.length - 1]?.high || 0} /></span>
        <span>저: <KRW value={candles[candles.length - 1]?.low || 0} /></span>
        <span>종: <KRW value={candles[candles.length - 1]?.close || 0} /></span>
      </div>
    </div>
  );
};

export default CandleChart;
