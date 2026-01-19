import React from 'react';
import { useGameStore } from '../store/gameStore';
import { KRW } from './Formatters';

const WatchlistPage: React.FC = () => {
  const { stocks, selectStock, news, marketStatus, currentDay, dayTickCount, closingCountdown } = useGameStore();
  
  // 남은 시간 계산 (1800틱 = 30분 = 1일)
  const remainingSeconds = 1800 - dayTickCount;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* 헤더 */}
      <header className="bg-gray-900 px-4 py-3 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold text-white">관심종목</h1>
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-400">
              Day {currentDay}
            </div>
            {marketStatus === 'OPEN' ? (
              <div className="flex items-center gap-1 text-xs">
                <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                <span className="text-green-500">장중</span>
                <span className="text-gray-500 ml-1">{minutes}:{seconds.toString().padStart(2, '0')}</span>
              </div>
            ) : (
              <div className="flex items-center gap-1 text-xs">
                <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                <span className="text-yellow-500">장마감</span>
                <span className="text-gray-500 ml-1">{closingCountdown}초</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* 테이블 헤더 */}
      <div className="grid grid-cols-12 px-4 py-2 bg-gray-900/50 text-xs text-gray-500 border-b border-gray-800">
        <div className="col-span-5">종목명</div>
        <div className="col-span-4 text-right">현재가</div>
        <div className="col-span-3 text-right">등락률</div>
      </div>

      {/* 종목 리스트 */}
      <div className="flex-1 overflow-y-auto">
        {stocks.map((stock) => {
          const diff = stock.currentPrice - stock.previousClose;
          const rate = stock.previousClose === 0 ? 0 : (diff / stock.previousClose) * 100;
          const isUp = diff > 0;
          const isDown = diff < 0;
          const colorClass = stock.isDelisted ? 'text-gray-600' : isUp ? 'text-red-500' : isDown ? 'text-blue-500' : 'text-gray-400';
          const bgClass = stock.isDelisted ? 'bg-gray-900/50' : stock.tradingHalted ? 'bg-yellow-900/10' : isUp ? 'bg-red-500/5' : isDown ? 'bg-blue-500/5' : '';
          
          return (
            <div
              key={stock.id}
              onClick={() => !stock.isDelisted && selectStock(stock.id)}
              className={`grid grid-cols-12 px-4 py-4 border-b border-gray-800/50 cursor-pointer hover:bg-gray-800/30 active:bg-gray-800/50 transition-colors ${bgClass} ${stock.isDelisted ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {/* 종목명 */}
              <div className="col-span-5 flex flex-col">
                <div className="flex items-center gap-1 flex-wrap">
                  <span className={`font-bold text-sm ${stock.isDelisted ? 'text-gray-500 line-through' : 'text-white'}`}>{stock.name}</span>
                  {stock.type === 'theme' && !stock.isDelisted && (
                    <span className="text-[10px] px-1 py-0.5 bg-purple-500/20 text-purple-400 rounded">테마</span>
                  )}
                  {stock.isDelisted && (
                    <span className="text-[10px] px-1 py-0.5 bg-gray-700 text-gray-400 rounded">상장폐지</span>
                  )}
                  {!stock.isDelisted && stock.tradingHalted && (
                    <span className="text-[10px] px-1 py-0.5 bg-yellow-500/30 text-yellow-400 rounded animate-pulse">거래정지</span>
                  )}
                  {!stock.isDelisted && !stock.tradingHalted && stock.delistingWarning && (
                    <span className="text-[10px] px-1 py-0.5 bg-orange-500/30 text-orange-400 rounded">⚠️위험</span>
                  )}
                  {!stock.isDelisted && !stock.tradingHalted && stock.priceFrozen && (
                    <span className={`text-[10px] px-1 py-0.5 rounded ${
                      stock.frozenAtLimit === 'upper' ? 'bg-red-500/30 text-red-400' : 'bg-blue-500/30 text-blue-400'
                    }`}>
                      {stock.frozenAtLimit === 'upper' ? '상한' : '하한'}
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500">{stock.symbol}</span>
                {stock.isDelisted && stock.delistedAtDay && (
                  <span className="text-[10px] text-gray-600">
                    재상장: Day {stock.delistedAtDay + 7}
                  </span>
                )}
              </div>
              
              {/* 현재가 */}
              <div className={`col-span-4 text-right font-bold ${colorClass}`}>
                <KRW value={stock.currentPrice} />
              </div>
              
              {/* 등락률 */}
              <div className={`col-span-3 text-right flex flex-col items-end ${colorClass}`}>
                <span className="flex items-center gap-0.5 text-sm">
                  {isUp && <span>▲</span>}
                  {isDown && <span>▼</span>}
                  <KRW value={Math.abs(diff)} />
                </span>
                <span className="text-xs">
                  {isUp && '+'}{rate.toFixed(2)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 뉴스 섹션 */}
      <div className="border-t border-gray-800 bg-gray-900">
        <div className="px-4 py-2 flex items-center justify-between border-b border-gray-800">
          <span className="text-xs font-bold text-gray-400">📰 실시간 뉴스</span>
          <span className="text-xs text-red-500 animate-pulse">● LIVE</span>
        </div>
        <div className="h-32 overflow-y-auto">
          {news.length === 0 ? (
            <div className="flex items-center justify-center h-full text-gray-600 text-sm">
              뉴스가 없습니다
            </div>
          ) : (
            news.slice(0, 5).map((item) => (
              <div
                key={item.id}
                className="px-4 py-2 border-b border-gray-800/50 hover:bg-gray-800/30"
              >
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                    item.effect === 'GOOD' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {item.effect === 'GOOD' ? '호재' : '악재'}
                  </span>
                  <span className="text-xs text-gray-500">Day {currentDay}</span>
                </div>
                <p className="text-sm text-gray-300 mt-1 line-clamp-1">{item.title}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default WatchlistPage;
