import React, { useMemo, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { KRW, Rate } from './Formatters';

// 거래 수수료율 (0.1%)
const TRANSACTION_FEE_RATE = 0.001;

const PortfolioPage: React.FC = () => {
  const { portfolio, stocks, cash, initialCash, realizedPnL, selectStock, transactions, sellAllStocks, marketStatus, gameTick, liquidatedPositions, clearLiquidatedPositions } = useGameStore();
  
  // 청산된 포지션이 있으면 알림 표시
  useEffect(() => {
    if (liquidatedPositions.length > 0) {
      const messages = liquidatedPositions.map(liq => 
        `💀 ${liq.stockName} (${liq.leverage}x)\n` +
        `청산가: ${liq.liquidationPrice.toLocaleString()}원\n` +
        `현재가: ${liq.currentPrice.toLocaleString()}원\n` +
        `손실: ${liq.lossAmount.toLocaleString()}원`
      );
      alert(`⚠️ 레버리지 포지션 청산!\n\n${messages.join('\n\n')}`);
      clearLiquidatedPositions();
    }
  }, [liquidatedPositions, clearLiquidatedPositions]);

  // 계산 (stocks와 gameTick이 변경될 때마다 재계산 - 주가 실시간 반영)
  // 레버리지 포지션: 투자금(증거금) × 레버리지 = 포지션 가치
  // 평가금액 = 투자금 × (1 + 레버리지 수익률)
  const totalStockValue = useMemo(() => {
    return portfolio.reduce((sum, item) => {
      const stock = stocks.find(s => s.id === item.stockId);
      if (!stock) return sum;
      
      const leverage = item.leverage || 1;
      const entryPrice = item.entryPrice || item.averagePrice;
      // 투자금(증거금) = 수량 × 평균단가
      const investmentAmount = item.averagePrice * item.quantity;
      
      if (leverage > 1) {
        // 레버리지 포지션: 평가금액 = 투자금 × (1 + 레버리지 수익률)
        // 예: 100만원 투자, 50배 레버리지, 1% 상승 → 100만원 × (1 + 0.5) = 150만원
        const baseReturn = (stock.currentPrice - entryPrice) / entryPrice;
        const leveragedReturn = baseReturn * leverage;
        const evaluatedValue = investmentAmount * (1 + leveragedReturn);
        return sum + Math.max(0, evaluatedValue); // 청산되지 않은 경우에만
      } else {
        // 일반 포지션: 평가금액 = 현재가 × 수량
        return sum + stock.currentPrice * item.quantity;
      }
    }, 0);
  }, [portfolio, stocks, gameTick]); // gameTick이 변경되면 주가도 변경된 것으로 간주

  // 총 투자금 (매입금액) - 레버리지 포지션도 투자금 전액이 매입금액
  const totalPurchaseAmount = useMemo(() => {
    return portfolio.reduce((sum, item) => {
      // 투자금 = 수량 × 평균단가 (레버리지 상관없이)
      return sum + item.averagePrice * item.quantity;
    }, 0);
  }, [portfolio]);

  const unrealizedPnL = totalStockValue - totalPurchaseAmount;
  const totalAsset = cash + totalStockValue;
  const totalReturn = ((totalAsset - initialCash) / initialCash) * 100;

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* 헤더 */}
      <header className="bg-gray-900 px-4 py-3 border-b border-gray-800">
        <h1 className="text-lg font-bold text-white">주식잔고</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* 자산 요약 */}
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 m-4 rounded-xl p-4 border border-gray-700">
          <div className="text-center mb-4">
            <p className="text-gray-400 text-sm mb-1">추정자산</p>
            <p className="text-3xl font-bold text-white">
              <KRW value={totalAsset} />
              <span className="text-lg text-gray-500 ml-1">원</span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-700">
            <div>
              <p className="text-gray-500 text-xs mb-1">평가손익</p>
              <p className={`font-bold ${unrealizedPnL >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                {unrealizedPnL >= 0 ? '+' : ''}<KRW value={unrealizedPnL} />
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1">실현손익</p>
              <p className={`font-bold ${realizedPnL >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                {realizedPnL >= 0 ? '+' : ''}<KRW value={realizedPnL} />
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1">수익률</p>
              <p className="font-bold">
                <Rate value={totalReturn} />
              </p>
            </div>
            <div>
              <p className="text-gray-500 text-xs mb-1">매입금액</p>
              <p className="font-bold text-white">
                <KRW value={totalPurchaseAmount} />
              </p>
            </div>
          </div>
        </div>

        {/* 예수금 */}
        <div className="mx-4 mb-4 bg-gray-900 rounded-lg p-4 border border-gray-800">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">예수금 (현금)</span>
            <span className="text-white font-bold text-lg">
              <KRW value={cash} /> 원
            </span>
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className="text-gray-400">평가금액</span>
            <span className="text-white font-bold text-lg">
              <KRW value={totalStockValue} /> 원
            </span>
          </div>
        </div>
        
        {/* 전량 매도 버튼 */}
        {portfolio.length > 0 && (
          <div className="mx-4 mb-4">
            <button
              onClick={() => {
                if (marketStatus === 'CLOSED') {
                  alert('장이 마감되었습니다. 다음 거래일에 다시 시도해주세요.');
                  return;
                }
                
                // 예상 수수료 계산
                const estimatedFee = Math.round(totalStockValue * TRANSACTION_FEE_RATE);
                const estimatedProceeds = totalStockValue - estimatedFee;
                
                if (confirm(
                  `보유 중인 모든 주식을 현재 시장가에 매도합니다.\n\n` +
                  `평가금액: ${totalStockValue.toLocaleString()}원\n` +
                  `예상 수수료: ${estimatedFee.toLocaleString()}원\n` +
                  `예상 수령액: ${estimatedProceeds.toLocaleString()}원\n\n` +
                  `정말 전량 매도하시겠습니까?`
                )) {
                  sellAllStocks();
                }
              }}
              disabled={marketStatus === 'CLOSED'}
              className={`w-full py-4 rounded-lg font-bold text-lg transition-all active:scale-98
                bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white
                disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              🚨 전량 매도 (시장가)
            </button>
            <p className="text-center text-xs text-gray-500 mt-2">
              모든 보유 주식을 현재 시장가에 즉시 매도합니다
            </p>
          </div>
        )}

        {/* 테이블 헤더 */}
        <div className="sticky top-0 bg-gray-900 px-4 py-2 border-y border-gray-800">
          <div className="grid grid-cols-12 text-xs text-gray-500">
            <div className="col-span-4">종목명</div>
            <div className="col-span-4 text-right">평가손익</div>
            <div className="col-span-4 text-right">평가금액</div>
          </div>
          <div className="grid grid-cols-12 text-xs text-gray-600 mt-1">
            <div className="col-span-4">보유수량</div>
            <div className="col-span-4 text-right">수익률</div>
            <div className="col-span-4 text-right">매입단가</div>
          </div>
        </div>

        {/* 보유 종목 리스트 */}
        <div className="px-4">
          {portfolio.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-gray-600 text-4xl mb-4">📊</div>
              <p className="text-gray-500">보유 종목이 없습니다</p>
              <p className="text-gray-600 text-sm mt-2">관심종목에서 매수해보세요</p>
            </div>
          ) : (
            portfolio.map((item, index) => {
              const stock = stocks.find(s => s.id === item.stockId);
              if (!stock) return null;

              // 투자금(증거금) = 수량 × 평균단가
              const investmentAmount = item.averagePrice * item.quantity;
              
              // 레버리지 포지션의 경우 레버리지 적용된 수익률 계산
              const leverage = item.leverage || 1;
              const isLeveraged = leverage > 1;
              const entryPrice = item.entryPrice || item.averagePrice;
              const liquidationPrice = item.liquidationPrice || (isLeveraged ? Math.round(entryPrice * (1 - 1/leverage)) : 0);
              
              // 레버리지 적용 수익률: (현재가 - 진입가) / 진입가 × 레버리지 × 100
              const baseReturn = (stock.currentPrice - entryPrice) / entryPrice;
              const leveragedReturn = baseReturn * leverage * 100;
              
              // 레버리지 포지션의 평가금액: 투자금 × (1 + 레버리지 수익률)
              // 예: 100만원 투자, 50배 레버리지, 1% 상승 → 100만원 × (1 + 0.5) = 150만원
              const valuation = isLeveraged 
                ? Math.max(0, investmentAmount * (1 + leveragedReturn / 100))
                : stock.currentPrice * item.quantity;
              
              const profit = valuation - investmentAmount;
              const profitRate = isLeveraged ? leveragedReturn : (investmentAmount === 0 ? 0 : (profit / investmentAmount) * 100);
              const isProfit = profit >= 0;
              
              // 청산 위험도 계산 (청산가까지 남은 비율)
              const liquidationRisk = isLeveraged 
                ? ((stock.currentPrice - liquidationPrice) / (entryPrice - liquidationPrice)) * 100
                : 100;

              return (
                <div
                  key={`${item.stockId}-${leverage}-${index}`}
                  onClick={() => selectStock(item.stockId)}
                  className={`py-4 border-b cursor-pointer hover:bg-gray-900/50 active:bg-gray-800/50 -mx-4 px-4 ${
                    isLeveraged 
                      ? liquidationRisk < 30 
                        ? 'border-red-800 bg-red-900/20' 
                        : 'border-yellow-800/50'
                      : 'border-gray-800/50'
                  }`}
                >
                  {/* 첫 번째 줄 */}
                  <div className="grid grid-cols-12 items-center">
                    <div className="col-span-4">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-white">{stock.name}</p>
                        {isLeveraged && (
                          <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-yellow-600 text-black">
                            {leverage}x
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`col-span-4 text-right font-bold ${isProfit ? 'text-red-500' : 'text-blue-500'}`}>
                      {isProfit ? '+' : ''}<KRW value={Math.round(profit)} />
                    </div>
                    <div className="col-span-4 text-right text-white font-medium">
                      <KRW value={valuation} />
                    </div>
                  </div>
                  
                  {/* 두 번째 줄 */}
                  <div className="grid grid-cols-12 items-center mt-1 text-sm">
                    <div className="col-span-4 text-gray-500">
                      {item.quantity} 주
                    </div>
                    <div className={`col-span-4 text-right ${isProfit ? 'text-red-500' : 'text-blue-500'}`}>
                      {isProfit ? '+' : ''}{profitRate.toFixed(2)}%
                      {isLeveraged && <span className="text-yellow-500 ml-1">(x{leverage})</span>}
                    </div>
                    <div className="col-span-4 text-right text-gray-500">
                      <KRW value={item.averagePrice} />
                    </div>
                  </div>
                  
                  {/* 레버리지 포지션 추가 정보 */}
                  {isLeveraged && (
                    <div className="mt-2 pt-2 border-t border-gray-800">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-500">
                          투자금: <KRW value={Math.round(investmentAmount)} />원
                        </span>
                        <span className={`font-medium ${liquidationRisk < 30 ? 'text-red-400' : 'text-yellow-500'}`}>
                          청산가: <KRW value={liquidationPrice} />원
                          {liquidationRisk < 50 && (
                            <span className="ml-1 text-red-400">⚠️ {liquidationRisk.toFixed(0)}%</span>
                          )}
                        </span>
                      </div>
                      {/* 청산 위험도 바 */}
                      <div className="mt-1.5 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className={`h-full transition-all ${
                            liquidationRisk < 30 ? 'bg-red-500' : 
                            liquidationRisk < 50 ? 'bg-yellow-500' : 'bg-green-500'
                          }`}
                          style={{ width: `${Math.min(100, Math.max(0, liquidationRisk))}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* 최근 거래 내역 */}
        {transactions.length > 0 && (
          <div className="mt-4 px-4 pb-4">
            <h3 className="text-sm font-bold text-gray-400 mb-2">최근 거래내역</h3>
            <div className="space-y-2">
              {transactions.slice(0, 5).map((tx) => (
                <div
                  key={tx.id}
                  className="bg-gray-900 rounded-lg p-3 border border-gray-800"
                >
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                        tx.type === '매수' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                      }`}>
                        {tx.type}
                      </span>
                      <span className="text-white font-medium">{tx.stockName}</span>
                    </div>
                    <span className="text-gray-500 text-xs">Tick {tx.time}</span>
                  </div>
                  <div className="flex justify-between items-center mt-2 text-sm">
                    <span className="text-gray-500">
                      {tx.quantity}주 × <KRW value={tx.price} />
                    </span>
                    <div className="text-right">
                      <span className={`font-bold ${tx.type === '매수' ? 'text-red-500' : 'text-blue-500'}`}>
                        <KRW value={tx.total} /> 원
                      </span>
                      {tx.fee > 0 && (
                        <span className="text-yellow-500 text-xs ml-2">
                          (수수료 <KRW value={tx.fee} />)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PortfolioPage;
