import React, { useState, useEffect } from 'react';
import { useGameStore } from '../store/gameStore';
import { useAuthStore } from '../store/authStore';
import { Stock } from '../types';
import { KRW } from './Formatters';

// 거래 수수료율 (0.1%)
const TRANSACTION_FEE_RATE = 0.001;

interface Props {
  stock: Stock;
}

const TradingPanel: React.FC<Props> = ({ stock }) => {
  const { cash, portfolio, buyStock, sellStock } = useGameStore();
  const { loadGameData } = useAuthStore();
  const [quantity, setQuantity] = useState<number>(1);
  const [mode, setMode] = useState<'BUY' | 'SELL'>('BUY');
  const [hasNickname, setHasNickname] = useState(true);
  
  // 닉네임 체크
  useEffect(() => {
    const checkNickname = async () => {
      const data = await loadGameData();
      setHasNickname(!!data?.nickname);
    };
    checkNickname();
  }, [loadGameData]);

  const holding = portfolio.find(p => p.stockId === stock.id);
  const holdingQty = holding?.quantity || 0;
  
  // 수수료 포함 최대 매수 가능 수량 계산
  const maxBuy = Math.floor(cash / (stock.currentPrice * (1 + TRANSACTION_FEE_RATE)));
  
  const orderAmount = quantity * stock.currentPrice;
  const fee = Math.round(orderAmount * TRANSACTION_FEE_RATE);
  const totalCost = mode === 'BUY' ? orderAmount + fee : orderAmount - fee;

  // Helper for percent buttons
  const setPercent = (pct: number) => {
    if (mode === 'BUY') {
      setQuantity(Math.floor(maxBuy * pct));
    } else {
      setQuantity(Math.floor(holdingQty * pct));
    }
  };

  const handleTransaction = () => {
    if (quantity <= 0) return;
    
    if (!hasNickname) {
      alert('거래를 시작하기 전에 닉네임을 설정해주세요.');
      return;
    }
    
    if (mode === 'BUY') {
      buyStock(stock.id, quantity, stock.currentPrice); // 시장가(현재가)로 매수
    } else {
      sellStock(stock.id, quantity, stock.currentPrice); // 시장가(현재가)로 매도
      if (quantity === holdingQty) setQuantity(0); // Reset if sold all
    }
  };

  return (
    <div className="bg-cardbg rounded-lg border border-gray-800 p-4 flex flex-col gap-4">
      {/* Tabs */}
      <div className="grid grid-cols-2 gap-2 bg-gray-900 p-1 rounded-lg">
        <button 
          onClick={() => setMode('BUY')}
          className={`py-2 rounded-md font-bold transition-all ${mode === 'BUY' ? 'bg-up text-white' : 'text-gray-400 hover:text-white'}`}
        >
          매수
        </button>
        <button 
          onClick={() => setMode('SELL')}
          className={`py-2 rounded-md font-bold transition-all ${mode === 'SELL' ? 'bg-down text-white' : 'text-gray-400 hover:text-white'}`}
        >
          매도
        </button>
      </div>

      {/* Info Grid */}
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">주문가능</span>
          <span className="font-bold">{mode === 'BUY' ? <KRW value={cash} /> : `${holdingQty}주`}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">최대가능</span>
          <span className="font-bold">{mode === 'BUY' ? `${maxBuy}주` : `${holdingQty}주`}</span>
        </div>
      </div>

      {/* Inputs */}
      <div className="flex items-center gap-2">
        <button onClick={() => setQuantity(Math.max(0, quantity - 1))} className="w-10 h-10 bg-gray-700 rounded text-xl">-</button>
        <div className="flex-1 bg-gray-900 rounded h-10 flex items-center justify-center font-bold text-lg border border-gray-700 relative">
          <input 
            type="number" 
            value={quantity} 
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="bg-transparent w-full text-center outline-none"
          />
          <span className="absolute right-3 text-xs text-gray-500">주</span>
        </div>
        <button onClick={() => setQuantity(quantity + 1)} className="w-10 h-10 bg-gray-700 rounded text-xl">+</button>
      </div>

      {/* Percent Shortcuts */}
      <div className="grid grid-cols-4 gap-2 text-xs">
        <button onClick={() => setPercent(0.1)} className="bg-gray-800 py-1 rounded hover:bg-gray-700">10%</button>
        <button onClick={() => setPercent(0.25)} className="bg-gray-800 py-1 rounded hover:bg-gray-700">25%</button>
        <button onClick={() => setPercent(0.5)} className="bg-gray-800 py-1 rounded hover:bg-gray-700">50%</button>
        <button onClick={() => setPercent(1)} className="bg-gray-800 py-1 rounded hover:bg-gray-700">최대</button>
      </div>

      {/* Total Estimate with Fee */}
      <div className="py-2 border-t border-gray-700 mt-2 space-y-1">
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">주문금액</span>
          <span className="text-white"><KRW value={orderAmount} />원</span>
        </div>
        <div className="flex justify-between items-center text-sm">
          <span className="text-gray-500">수수료(0.1%)</span>
          <span className="text-yellow-500">{mode === 'BUY' ? '+' : '-'}<KRW value={fee} />원</span>
        </div>
        <div className="flex justify-between items-center pt-1">
          <span className="text-gray-400">{mode === 'BUY' ? '총 필요금액' : '예상 수령액'}</span>
          <span className={`text-xl font-bold ${mode === 'BUY' ? 'text-up' : 'text-down'}`}>
            <KRW value={totalCost} />
            <span className="text-sm text-gray-500 ml-1">원</span>
          </span>
        </div>
      </div>

      {/* Action Button */}
      <button 
        onClick={handleTransaction}
        disabled={quantity === 0 || (mode === 'BUY' && (orderAmount + fee) > cash) || (mode === 'SELL' && quantity > holdingQty)}
        className={`
          w-full py-4 rounded-lg font-bold text-xl shadow-lg transition-transform active:scale-95
          ${mode === 'BUY' ? 'bg-up hover:bg-red-600' : 'bg-down hover:bg-blue-600'}
          disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-700
        `}
      >
        {mode === 'BUY' ? '시장가 매수' : '시장가 매도'}
      </button>
    </div>
  );
};

export default TradingPanel;