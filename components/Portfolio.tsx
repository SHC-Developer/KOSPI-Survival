import React from 'react';
import { useGameStore } from '../store/gameStore';
import { KRW, Rate } from './Formatters';

const Portfolio: React.FC = () => {
  const { portfolio, stocks, cash, initialCash } = useGameStore();

  const totalStockValue = portfolio.reduce((sum, item) => {
    const stock = stocks.find(s => s.id === item.stockId);
    return sum + (stock ? stock.currentPrice * item.quantity : 0);
  }, 0);

  const totalAsset = cash + totalStockValue;
  const totalReturn = ((totalAsset - initialCash) / initialCash) * 100;
  const totalReturnAmt = totalAsset - initialCash;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Summary Card */}
      <div className="bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-700">
        <div className="flex justify-between items-start mb-4">
            <div>
                <h2 className="text-gray-400 text-sm">총 추정자산</h2>
                <div className="text-2xl font-bold text-white"><KRW value={totalAsset} />원</div>
            </div>
            <div className="text-right">
                <h2 className="text-gray-400 text-sm">총 수익률</h2>
                <div className="flex flex-col items-end">
                    <span className="text-xl font-bold"><Rate value={totalReturn} /></span>
                    <span className={`text-sm ${totalReturnAmt >= 0 ? 'text-up' : 'text-down'}`}>
                        <KRW value={totalReturnAmt} />
                    </span>
                </div>
            </div>
        </div>
        <div className="grid grid-cols-2 gap-4 border-t border-gray-700 pt-3">
             <div>
                <div className="text-gray-500 text-xs">예수금(현금)</div>
                <div className="text-white font-medium"><KRW value={cash} /></div>
             </div>
             <div>
                <div className="text-gray-500 text-xs">주식매입금</div>
                <div className="text-white font-medium"><KRW value={totalStockValue} /></div>
             </div>
        </div>
      </div>

      {/* Holdings List */}
      <div className="bg-cardbg rounded-lg flex-1 border border-gray-800 flex flex-col min-h-0">
        <div className="p-3 border-b border-gray-700 font-bold text-sm bg-gray-900/50">보유잔고</div>
        <div className="overflow-y-auto p-2 space-y-2">
            {portfolio.length === 0 && (
                <div className="text-center text-gray-500 py-10">보유 종목이 없습니다.</div>
            )}
            {portfolio.map(item => {
                const stock = stocks.find(s => s.id === item.stockId);
                if (!stock) return null;

                const valuation = stock.currentPrice * item.quantity;
                const costBasis = item.averagePrice * item.quantity;
                const profit = valuation - costBasis;
                const profitRate = (profit / costBasis) * 100;

                return (
                    <div key={item.stockId} className="bg-gray-800/50 p-3 rounded border border-gray-700">
                        <div className="flex justify-between mb-2">
                            <span className="font-bold text-gray-200">{stock.name}</span>
                            <span className="text-sm text-gray-400">{item.quantity}주</span>
                        </div>
                        <div className="grid grid-cols-2 gap-y-1 text-sm">
                            <div className="text-gray-500">평가손익</div>
                            <div className={`text-right ${profit > 0 ? 'text-up' : 'text-down'}`}>
                                <KRW value={profit} />
                            </div>
                            <div className="text-gray-500">수익률</div>
                            <div className="text-right"><Rate value={profitRate} /></div>
                            <div className="text-gray-500">평가금액</div>
                            <div className="text-right text-white"><KRW value={valuation} /></div>
                        </div>
                    </div>
                );
            })}
        </div>
      </div>
    </div>
  );
};

export default Portfolio;