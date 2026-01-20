import React, { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { KRW } from './Formatters';
import CandleChart from './CandleChart';

const StockPricePage: React.FC = () => {
  const { stocks, selectedStockId, setPage, setSelectedOrderPrice, gameTick } = useGameStore();
  const [showChart, setShowChart] = useState(false);
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);
  
  const stock = stocks.find(s => s.id === selectedStockId);
  
  // 거래정지 남은 시간 계산 (초 단위)
  const getRemainingHaltTime = () => {
    if (!stock || !stock.tradingHalted || !stock.haltedUntilTick) return 0;
    const remaining = stock.haltedUntilTick - gameTick;
    return Math.max(0, remaining);
  };
  
  const remainingHaltSeconds = getRemainingHaltTime();
  const haltMinutes = Math.floor(remainingHaltSeconds / 60);
  const haltSeconds = remainingHaltSeconds % 60;
  
  if (!stock) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-950">
        <p className="text-gray-500">종목을 선택해주세요</p>
      </div>
    );
  }

  const diff = stock.currentPrice - stock.previousClose;
  const rate = stock.previousClose === 0 ? 0 : (diff / stock.previousClose) * 100;
  const isUp = diff > 0;
  const colorClass = isUp ? 'text-red-500' : diff < 0 ? 'text-blue-500' : 'text-gray-400';

  const handlePriceClick = (price: number) => {
    setSelectedPrice(selectedPrice === price ? null : price);
  };

  const handleBuy = (price: number) => {
    setSelectedOrderPrice(price);
    setPage('order');
  };

  const handleSell = (price: number) => {
    setSelectedOrderPrice(price);
    setPage('order');
  };

  if (showChart) {
    return <CandleChart stock={stock} onBack={() => setShowChart(false)} />;
  }

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* 헤더 */}
      <header className="bg-gray-900 px-4 py-3 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">{stock.name}</h1>
            <p className="text-xs text-gray-500">{stock.symbol} · KOSPI</p>
          </div>
          <button
            onClick={() => setShowChart(true)}
            className="px-3 py-1.5 bg-gray-800 rounded text-xs text-gray-300 hover:bg-gray-700 transition-colors"
          >
            차트 보기
          </button>
        </div>
        
        {/* 현재가 표시 */}
        <div className="mt-3 flex items-end gap-3 flex-wrap">
          <span className={`text-3xl font-bold ${colorClass}`}>
            <KRW value={stock.currentPrice} />
          </span>
          <div className={`flex items-center gap-1 ${colorClass} text-sm`}>
            <span>{isUp ? '▲' : diff < 0 ? '▼' : '-'}</span>
            <span><KRW value={Math.abs(diff)} /></span>
            <span className="text-xs">({isUp ? '+' : ''}{rate.toFixed(2)}%)</span>
          </div>
          {stock.priceFrozen && !stock.tradingHalted && (
            <span className={`text-xs px-2 py-1 rounded ${
              stock.frozenAtLimit === 'upper' ? 'bg-red-500/30 text-red-400' : 'bg-blue-500/30 text-blue-400'
            }`}>
              {stock.frozenAtLimit === 'upper' ? '🔺 상한가' : '🔻 하한가'}
            </span>
          )}
          {stock.tradingHalted && (
            <span className="text-xs px-2 py-1 rounded bg-yellow-500/30 text-yellow-400 animate-pulse">
              ⏸️ 거래정지 중
            </span>
          )}
          {stock.delistingWarning && !stock.isDelisted && (
            <span className="text-xs px-2 py-1 rounded bg-orange-500/30 text-orange-400">
              ⚠️ 상장폐지 위험
            </span>
          )}
        </div>
        
        {/* 거래정지 경고 배너 + 타이머 */}
        {stock.tradingHalted && (
          <div className="mt-3 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-yellow-400 text-sm font-bold">⏸️ 거래정지 상태</p>
                <p className="text-yellow-500 text-xs mt-1">
                  {stock.frozenAtLimit === 'upper' ? '상한가' : '하한가'} 도달로 5분간 거래가 중단됩니다.
                </p>
              </div>
              {/* 타이머 */}
              <div className="text-right">
                <p className="text-yellow-400 text-2xl font-bold font-mono">
                  {haltMinutes}:{haltSeconds.toString().padStart(2, '0')}
                </p>
                <p className="text-yellow-500 text-xs">남은 시간</p>
              </div>
            </div>
            {/* 진행 바 */}
            <div className="mt-2 h-1.5 bg-yellow-900 rounded-full overflow-hidden">
              <div 
                className="h-full bg-yellow-500 transition-all duration-1000"
                style={{ width: `${((300 - remainingHaltSeconds) / 300) * 100}%` }}
              />
            </div>
          </div>
        )}
        
        {/* 상장폐지 위험 경고 배너 */}
        {stock.delistingWarning && !stock.isDelisted && !stock.tradingHalted && (
          <div className="mt-3 p-3 bg-orange-900/30 border border-orange-700 rounded-lg">
            <p className="text-orange-400 text-sm font-bold">⚠️ 상장폐지 위험</p>
            <p className="text-orange-500 text-xs mt-1">
              주가가 500원 미만으로 떨어지면 상장폐지됩니다.
            </p>
          </div>
        )}
        
        {/* 상/하한가 정보 */}
        <div className="mt-2 flex gap-4 text-xs text-gray-500">
          <span>하한가: <KRW value={stock.lowerLimit} /></span>
          <span>상한가: <KRW value={stock.upperLimit} /></span>
        </div>
      </header>

      {/* 호가창 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        <div className="px-4 py-2 bg-gray-900/50 border-b border-gray-800">
          <span className="text-xs font-bold text-gray-400">호가</span>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {/* 매도 호가 (위에서 아래로, 높은 가격부터) */}
          <div className="bg-blue-950/20">
            {stock.orderBook.asks.map((level, idx) => {
              const priceRate = stock.previousClose === 0 ? 0 : ((level.price - stock.previousClose) / stock.previousClose) * 100;
              const isSelected = selectedPrice === level.price;
              const maxVolume = Math.max(...stock.orderBook.asks.map(a => a.volume), ...stock.orderBook.bids.map(b => b.volume));
              const volumePercent = (level.volume / maxVolume) * 100;
              
              return (
                <div
                  key={`ask-${idx}`}
                  onClick={() => handlePriceClick(level.price)}
                  className={`relative grid grid-cols-12 px-4 py-2.5 border-b border-gray-800/30 cursor-pointer transition-colors ${
                    isSelected ? 'bg-gray-800' : 'hover:bg-gray-800/50'
                  }`}
                >
                  {/* 볼륨 바 */}
                  <div 
                    className="absolute right-0 top-0 bottom-0 bg-blue-500/10"
                    style={{ width: `${volumePercent}%` }}
                  />
                  
                  <div className="col-span-4 text-gray-500 text-sm relative z-10">
                    <KRW value={level.volume} />
                  </div>
                  <div className="col-span-4 text-center relative z-10">
                    <span className="text-blue-400 font-bold">
                      <KRW value={level.price} />
                    </span>
                  </div>
                  <div className="col-span-4 text-right text-blue-400 text-sm relative z-10">
                    {priceRate >= 0 ? '+' : ''}{priceRate.toFixed(2)}%
                  </div>
                  
                  {/* 선택시 매수/매도 버튼 */}
                  {isSelected && (
                    <div className="col-span-12 flex gap-2 mt-2 relative z-10">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleBuy(level.price); }}
                        className="flex-1 py-2 bg-red-600 text-white font-bold rounded text-sm hover:bg-red-500"
                      >
                        매수
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSell(level.price); }}
                        className="flex-1 py-2 bg-blue-600 text-white font-bold rounded text-sm hover:bg-blue-500"
                      >
                        매도
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {/* 현재가 표시줄 */}
          <div className="grid grid-cols-12 px-4 py-3 bg-gray-800 border-y-2 border-orange-500">
            <div className="col-span-4 text-gray-400 text-sm">현재가</div>
            <div className="col-span-4 text-center">
              <span className={`font-bold text-lg ${colorClass}`}>
                <KRW value={stock.currentPrice} />
              </span>
            </div>
            <div className={`col-span-4 text-right ${colorClass} text-sm`}>
              {isUp ? '+' : ''}{rate.toFixed(2)}%
            </div>
          </div>
          
          {/* 매수 호가 (위에서 아래로, 높은 가격부터) */}
          <div className="bg-red-950/20">
            {stock.orderBook.bids.map((level, idx) => {
              const priceRate = stock.previousClose === 0 ? 0 : ((level.price - stock.previousClose) / stock.previousClose) * 100;
              const isSelected = selectedPrice === level.price;
              const maxVolume = Math.max(...stock.orderBook.asks.map(a => a.volume), ...stock.orderBook.bids.map(b => b.volume));
              const volumePercent = (level.volume / maxVolume) * 100;
              
              return (
                <div
                  key={`bid-${idx}`}
                  onClick={() => handlePriceClick(level.price)}
                  className={`relative grid grid-cols-12 px-4 py-2.5 border-b border-gray-800/30 cursor-pointer transition-colors ${
                    isSelected ? 'bg-gray-800' : 'hover:bg-gray-800/50'
                  }`}
                >
                  {/* 볼륨 바 */}
                  <div 
                    className="absolute left-0 top-0 bottom-0 bg-red-500/10"
                    style={{ width: `${volumePercent}%` }}
                  />
                  
                  <div className="col-span-4 text-gray-500 text-sm relative z-10">
                    {/* 매수잔량은 오른쪽에 표시 */}
                  </div>
                  <div className="col-span-4 text-center relative z-10">
                    <span className="text-red-400 font-bold">
                      <KRW value={level.price} />
                    </span>
                  </div>
                  <div className="col-span-4 text-right relative z-10 flex items-center justify-end gap-2">
                    <span className="text-red-400 text-sm">
                      {priceRate >= 0 ? '+' : ''}{priceRate.toFixed(2)}%
                    </span>
                    <span className="text-gray-500 text-sm">
                      <KRW value={level.volume} />
                    </span>
                  </div>
                  
                  {/* 선택시 매수/매도 버튼 */}
                  {isSelected && (
                    <div className="col-span-12 flex gap-2 mt-2 relative z-10">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleBuy(level.price); }}
                        className="flex-1 py-2 bg-red-600 text-white font-bold rounded text-sm hover:bg-red-500"
                      >
                        매수
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSell(level.price); }}
                        className="flex-1 py-2 bg-blue-600 text-white font-bold rounded text-sm hover:bg-blue-500"
                      >
                        매도
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockPricePage;
