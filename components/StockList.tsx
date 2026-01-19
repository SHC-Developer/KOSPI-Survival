import React from 'react';
import { useGameStore } from '../store/gameStore';
import { KRW, PriceChange } from './Formatters';

const StockList: React.FC = () => {
  const { stocks, selectStock, selectedStockId } = useGameStore();

  return (
    <div className="bg-cardbg rounded-lg overflow-hidden flex flex-col h-full border border-gray-800">
      <div className="p-3 bg-gray-800/50 border-b border-gray-700 font-bold text-sm text-gray-300">
        관심종목
      </div>
      <div className="overflow-y-auto flex-1">
        {stocks.map((stock) => {
           const diff = stock.currentPrice - stock.previousClose;
           const colorClass = diff > 0 ? 'text-up' : diff < 0 ? 'text-down' : 'text-white';
           
           return (
            <div 
              key={stock.id}
              onClick={() => selectStock(stock.id)}
              className={`
                flex justify-between items-center p-3 border-b border-gray-800 cursor-pointer transition-colors
                ${selectedStockId === stock.id ? 'bg-gray-800' : 'hover:bg-gray-800/30'}
              `}
            >
              <div className="flex flex-col">
                <span className="font-bold text-gray-100">{stock.name}</span>
                <span className="text-xs text-gray-500">{stock.symbol}</span>
              </div>
              <div className={`flex flex-col items-end ${colorClass}`}>
                <span className="font-bold text-lg leading-tight"><KRW value={stock.currentPrice} /></span>
                <div className="text-xs flex items-center gap-1">
                   <PriceChange current={stock.currentPrice} reference={stock.previousClose} />
                </div>
              </div>
            </div>
           );
        })}
      </div>
    </div>
  );
};

export default StockList;