import React, { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../store/gameStore';
import { useAuthStore } from '../store/authStore';
import { KRW } from './Formatters';

// 거래 수수료율 (0.1%)
const TRANSACTION_FEE_RATE = 0.001;

// 호가 단위 계산 (functions/index.js와 동일)
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

// 레버리지 배율 옵션
const LEVERAGE_OPTIONS = [1, 2, 5, 10, 25, 50];

const OrderPage: React.FC = () => {
  const { 
    stocks, 
    selectedStockId, 
    selectedOrderPrice, 
    cash, 
    portfolio, 
    buyStock, 
    sellStock,
    buyStockWithLeverage,
    addPendingOrder,
    pendingOrders,
    cancelPendingOrder,
    setPage,
    marketStatus 
  } = useGameStore();
  
  const { loadGameData } = useAuthStore();
  const [hasNickname, setHasNickname] = useState(true);
  
  const [mode, setMode] = useState<'BUY' | 'SELL'>('BUY');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market'); // 시장가 vs 예약
  const [quantity, setQuantity] = useState<number>(0);
  const [limitPrice, setLimitPrice] = useState<number>(0); // 예약 주문 가격
  const [leverage, setLeverage] = useState<number>(1); // 레버리지 배율 (1=일반)
  
  // 이전 종목 ID를 추적하여 종목 변경 시에만 가격 초기화
  const prevStockIdRef = useRef<string | null>(null);
  // 이전 호가 선택 가격을 추적
  const prevOrderPriceRef = useRef<number | null>(null);
  
  const stock = stocks.find(s => s.id === selectedStockId);
  const holding = portfolio.find(p => p.stockId === selectedStockId);
  const holdingQty = holding?.quantity || 0;
  
  // 해당 종목의 예약 주문
  const stockPendingOrders = pendingOrders.filter(o => o.stockId === selectedStockId);
  
  // 호가창에서 가격을 선택했을 때만 가격 업데이트
  useEffect(() => {
    if (selectedOrderPrice && selectedOrderPrice !== prevOrderPriceRef.current && stock) {
      setLimitPrice(selectedOrderPrice);
      setOrderType('limit'); // 호가창에서 선택한 경우 예약 주문으로
      prevOrderPriceRef.current = selectedOrderPrice;
    }
  }, [selectedOrderPrice, stock]);
  
  // 종목 변경 시에만 예약 가격 초기화 (실시간 가격 변동과 무관하게)
  useEffect(() => {
    if (stock && selectedStockId !== prevStockIdRef.current) {
      setLimitPrice(stock.currentPrice);
      prevStockIdRef.current = selectedStockId;
      prevOrderPriceRef.current = null; // 종목 변경 시 호가 선택 초기화
    }
  }, [selectedStockId, stock]);

  // 닉네임 체크
  useEffect(() => {
    const checkNickname = async () => {
      const data = await loadGameData();
      setHasNickname(!!data?.nickname);
    };
    checkNickname();
  }, [loadGameData]);
  
  if (!stock) {
    return (
      <div className="flex flex-col h-full bg-gray-950">
        <header className="bg-gray-900 px-4 py-3 border-b border-gray-800">
          <h1 className="text-lg font-bold text-white">주식주문</h1>
        </header>
        <div className="flex-1 flex items-center justify-center text-gray-500">
          종목을 먼저 선택해주세요
        </div>
      </div>
    );
  }

  // 시장가 주문 시 현재가, 예약 주문 시 지정 가격
  const effectivePrice = orderType === 'market' ? stock.currentPrice : limitPrice;
  
  // 최대 매수 수량 계산 (레버리지 상관없이 주문금액이 증거금)
  const maxBuy = effectivePrice > 0 
    ? Math.floor(cash / (effectivePrice * (1 + TRANSACTION_FEE_RATE))) 
    : 0;
  const maxSell = holdingQty;
  
  // 주문 금액 = 증거금 (레버리지 상관없이 이 금액이 현금에서 차감됨)
  const orderAmount = quantity * effectivePrice; // 증거금 = 수량 × 단가
  // 레버리지 적용 시 포지션 가치 = 증거금 × 레버리지
  const positionValue = leverage > 1 ? orderAmount * leverage : orderAmount;
  const fee = Math.round(orderAmount * TRANSACTION_FEE_RATE);
  const totalAmount = mode === 'BUY' ? orderAmount + fee : orderAmount - fee;
  
  // 청산가 계산 (레버리지 매수 시)
  // 증거금 전액 손실 = 포지션 가치 100%/레버리지 하락 시
  // 예: 50배 레버리지 → 2% 하락 시 청산
  const liquidationPrice = leverage > 1 
    ? Math.round(effectivePrice * (1 - (1 / leverage)))
    : 0;
  
  const canMarketOrder = quantity > 0 && (
    (mode === 'BUY' && totalAmount <= cash) ||
    (mode === 'SELL' && quantity <= holdingQty)
  );
  
  const canLimitOrder = quantity > 0 && limitPrice > 0 && (
    (mode === 'BUY') || // 매수 예약은 항상 가능 (체결 시 현금 체크)
    (mode === 'SELL' && quantity <= holdingQty)
  );
  
  // 모드 변경 시 레버리지 초기화
  React.useEffect(() => {
    if (mode === 'SELL') {
      setLeverage(1);
    }
  }, [mode]);

  // 시장가 즉시 주문
  const handleMarketOrder = () => {
    if (!canMarketOrder || marketStatus === 'CLOSED') return;
    
    if (!hasNickname) {
      alert('거래를 시작하기 전에 닉네임을 설정해주세요.');
      return;
    }
    
    if (mode === 'BUY') {
      if (leverage > 1) {
        // 레버리지 매수
        buyStockWithLeverage(stock.id, quantity, stock.currentPrice, leverage);
      } else {
        // 일반 매수
        buyStock(stock.id, quantity, stock.currentPrice);
      }
    } else {
      sellStock(stock.id, quantity, stock.currentPrice); // 현재 시장가로 매도
    }
    
    setQuantity(0);
    setLeverage(1); // 주문 후 레버리지 초기화
    setPage('portfolio');
  };
  
  // 예약 주문 등록
  const handleLimitOrder = () => {
    if (!canLimitOrder || marketStatus === 'CLOSED') return;
    
    if (!hasNickname) {
      alert('거래를 시작하기 전에 닉네임을 설정해주세요.');
      return;
    }
    
    addPendingOrder({
      stockId: stock.id,
      side: mode === 'BUY' ? 'buy' : 'sell',
      quantity,
      targetPrice: limitPrice,
    });
    
    setQuantity(0);
    alert(`${mode === 'BUY' ? '매수' : '매도'} 예약이 등록되었습니다.\n목표가: ${limitPrice.toLocaleString()}원`);
  };

  const setPercent = (pct: number) => {
    if (mode === 'BUY') {
      setQuantity(Math.floor(maxBuy * pct));
    } else {
      setQuantity(Math.floor(maxSell * pct));
    }
  };

  const diff = stock.currentPrice - stock.previousClose;
  const rate = stock.previousClose === 0 ? 0 : (diff / stock.previousClose) * 100;
  const isUp = diff > 0;
  const colorClass = isUp ? 'text-red-500' : diff < 0 ? 'text-blue-500' : 'text-gray-400';

  return (
    <div className="flex flex-col h-full bg-gray-950">
      {/* 헤더 */}
      <header className="bg-gray-900 px-4 py-3 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">{stock.name}</h1>
            <p className="text-xs text-gray-500">{stock.symbol}</p>
          </div>
          <div className={`text-right ${colorClass}`}>
            <div className="text-xl font-bold"><KRW value={stock.currentPrice} /></div>
            <div className="text-xs">
              {isUp ? '+' : ''}{rate.toFixed(2)}%
            </div>
          </div>
        </div>
      </header>

      {/* 장 마감 경고 */}
      {marketStatus === 'CLOSED' && (
        <div className="bg-yellow-900/30 border-b border-yellow-800 px-4 py-2 text-yellow-500 text-sm text-center">
          ⚠️ 장이 마감되었습니다. 잠시 후 다시 시도해주세요.
        </div>
      )}
      
      {/* 상장폐지 경고 */}
      {stock.isDelisted && (
        <div className="bg-gray-800 border-b border-gray-700 px-4 py-3 text-center">
          <p className="text-gray-400 font-bold">🚫 상장폐지된 종목</p>
          <p className="text-gray-500 text-sm mt-1">
            이 종목은 상장폐지되어 거래할 수 없습니다.
            {stock.delistedAtDay && <span> (재상장 예정: Day {stock.delistedAtDay + 7})</span>}
          </p>
        </div>
      )}
      
      {/* 거래정지 경고 */}
      {!stock.isDelisted && stock.tradingHalted && (
        <div className="bg-yellow-900/30 border-b border-yellow-800 px-4 py-3 text-center">
          <p className="text-yellow-400 font-bold">⏸️ 거래정지 중</p>
          <p className="text-yellow-500 text-sm mt-1">
            {stock.frozenAtLimit === 'upper' ? '상한가' : '하한가'} 도달로 5분간 거래가 중단됩니다.
          </p>
        </div>
      )}

      {/* 매수/매도 탭 */}
      <div className="flex border-b border-gray-800">
        <button
          onClick={() => setMode('BUY')}
          className={`flex-1 py-3 font-bold text-sm border-b-2 transition-colors ${
            mode === 'BUY'
              ? 'text-red-500 border-red-500 bg-red-500/10'
              : 'text-gray-500 border-transparent hover:text-gray-300'
          }`}
        >
          매수
        </button>
        <button
          onClick={() => setMode('SELL')}
          className={`flex-1 py-3 font-bold text-sm border-b-2 transition-colors ${
            mode === 'SELL'
              ? 'text-blue-500 border-blue-500 bg-blue-500/10'
              : 'text-gray-500 border-transparent hover:text-gray-300'
          }`}
        >
          매도
        </button>
      </div>

      {/* 주문 폼 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 주문 유형 선택 */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setOrderType('market')}
            className={`py-3 rounded-lg font-bold text-sm transition-all ${
              orderType === 'market'
                ? 'bg-orange-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            시장가 주문
          </button>
          <button
            onClick={() => setOrderType('limit')}
            className={`py-3 rounded-lg font-bold text-sm transition-all ${
              orderType === 'limit'
                ? 'bg-purple-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
            }`}
          >
            예약 주문
          </button>
        </div>
        
        {/* 주문 유형 설명 */}
        <div className="bg-gray-900/50 rounded-lg p-3 text-xs text-gray-400">
          {orderType === 'market' ? (
            <p>💡 <span className="text-orange-400">시장가 주문</span>: 현재 시장 가격으로 즉시 체결됩니다.</p>
          ) : (
            <p>💡 <span className="text-purple-400">예약 주문</span>: {mode === 'BUY' ? '목표가 이하' : '목표가 이상'}가 되면 자동으로 체결됩니다.</p>
          )}
        </div>
        
        {/* 주문 가능 금액/수량 */}
        <div className="bg-gray-900 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">
              {mode === 'BUY' ? '현금 가능' : '보유 수량'}
            </span>
            <span className="text-white font-medium">
              {mode === 'BUY' ? <><KRW value={cash} /> 원</> : `${holdingQty} 주`}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">최대 주문 가능</span>
            <span className="text-white font-medium">
              {mode === 'BUY' ? maxBuy : maxSell} 주
            </span>
          </div>
          {mode === 'SELL' && holding && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">평균 매입가</span>
              <span className="text-white font-medium">
                <KRW value={holding.averagePrice} /> 원
              </span>
            </div>
          )}
        </div>

        {/* 예약 주문 시 가격 입력 */}
        {orderType === 'limit' && (
          <div className="space-y-2">
            <label className="text-sm text-gray-400">
              {mode === 'BUY' ? '매수 목표가 (이 가격 이하일 때 체결)' : '매도 목표가 (이 가격 이상일 때 체결)'}
            </label>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const tickSize = getTickSize(limitPrice);
                  const newPrice = roundToTickSize(Math.max(0, limitPrice - tickSize));
                  setLimitPrice(newPrice);
                }}
                className="w-12 h-12 bg-gray-800 rounded-lg text-xl text-gray-300 hover:bg-gray-700"
              >
                -
              </button>
              <div className="flex-1 bg-gray-800 rounded-lg h-12 flex items-center justify-center relative">
                <input
                  type="number"
                  value={limitPrice}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    const rounded = roundToTickSize(value);
                    setLimitPrice(rounded);
                  }}
                  className="bg-transparent text-center text-white font-bold text-lg w-full h-full outline-none"
                />
                <span className="absolute right-4 text-gray-500 text-sm">원</span>
              </div>
              <button
                onClick={() => {
                  const tickSize = getTickSize(limitPrice);
                  const newPrice = roundToTickSize(limitPrice + tickSize);
                  setLimitPrice(newPrice);
                }}
                className="w-12 h-12 bg-gray-800 rounded-lg text-xl text-gray-300 hover:bg-gray-700"
              >
                +
              </button>
            </div>
            <button
              onClick={() => setLimitPrice(stock.currentPrice)}
              className="w-full py-2 bg-gray-800 rounded text-sm text-gray-400 hover:bg-gray-700"
            >
              현재가 적용 ({stock.currentPrice.toLocaleString()}원)
            </button>
          </div>
        )}

        {/* 수량 입력 */}
        <div className="space-y-2">
          <label className="text-sm text-gray-400">주문 수량</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setQuantity(Math.max(0, quantity - 1))}
              className="w-12 h-12 bg-gray-800 rounded-lg text-xl text-gray-300 hover:bg-gray-700"
            >
              -
            </button>
            <div className="flex-1 bg-gray-800 rounded-lg h-12 flex items-center justify-center relative">
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(0, Number(e.target.value)))}
                className="bg-transparent text-center text-white font-bold text-lg w-full h-full outline-none"
              />
              <span className="absolute right-4 text-gray-500 text-sm">주</span>
            </div>
            <button
              onClick={() => setQuantity(quantity + 1)}
              className="w-12 h-12 bg-gray-800 rounded-lg text-xl text-gray-300 hover:bg-gray-700"
            >
              +
            </button>
          </div>
          
          {/* 퍼센트 버튼 */}
          <div className="grid grid-cols-4 gap-2">
            {[0.1, 0.25, 0.5, 1].map((pct) => (
              <button
                key={pct}
                onClick={() => setPercent(pct)}
                className="py-2 bg-gray-800 rounded text-sm text-gray-400 hover:bg-gray-700"
              >
                {pct === 1 ? '최대' : `${pct * 100}%`}
              </button>
            ))}
          </div>
        </div>

        {/* 레버리지 선택 (매수 + 시장가 주문 시에만) */}
        {mode === 'BUY' && orderType === 'market' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-gray-400">레버리지 (신용거래)</label>
              {leverage > 1 && (
                <span className="text-xs text-yellow-500">⚠️ 청산 위험</span>
              )}
            </div>
            <div className="grid grid-cols-6 gap-1">
              {LEVERAGE_OPTIONS.map((lev) => (
                <button
                  key={lev}
                  onClick={() => setLeverage(lev)}
                  className={`py-2.5 rounded-lg font-bold text-sm transition-all ${
                    leverage === lev
                      ? lev === 1 
                        ? 'bg-gray-600 text-white ring-2 ring-gray-400'
                        : 'bg-gradient-to-r from-yellow-600 to-orange-600 text-white ring-2 ring-yellow-400'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {lev === 1 ? '없음' : `${lev}x`}
                </button>
              ))}
            </div>
            
            {/* 레버리지 설명 및 청산가 표시 */}
            {leverage > 1 && (
              <div className="bg-yellow-900/30 border border-yellow-800 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-yellow-400 text-sm font-medium">
                  <span>⚡ {leverage}배 레버리지</span>
                </div>
                <div className="text-xs text-gray-300 space-y-1">
                  <div className="flex justify-between">
                    <span>투자금 (증거금)</span>
                    <span className="text-white font-medium">
                      <KRW value={orderAmount} />원
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>포지션 가치 (×{leverage})</span>
                    <span className="text-yellow-400 font-bold">
                      <KRW value={positionValue} />원
                    </span>
                  </div>
                  <div className="flex justify-between text-red-400">
                    <span>청산가</span>
                    <span className="font-bold">
                      <KRW value={liquidationPrice} />원 (-{(100/leverage).toFixed(1)}%)
                    </span>
                  </div>
                </div>
                <p className="text-xs text-yellow-500/80 mt-2">
                  💀 주가가 청산가 이하로 떨어지면 투자금 전액을 잃습니다!
                </p>
              </div>
            )}
          </div>
        )}

        {/* 총 주문 금액 */}
        <div className="bg-gray-900 rounded-lg p-4 space-y-2">
          {mode === 'BUY' && leverage > 1 && (
            <div className="flex justify-between items-center">
              <span className="text-gray-400">포지션 가치 (×{leverage})</span>
              <span className="text-yellow-400 font-medium">
                <KRW value={positionValue} /> 원
              </span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-gray-400">
              {mode === 'BUY' && leverage > 1 ? '투자금 (증거금)' : '주문 금액'}
            </span>
            <span className="text-white font-medium">
              <KRW value={orderAmount} /> 원
            </span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-500">수수료 (0.1%)</span>
            <span className="text-yellow-500">
              {mode === 'BUY' ? '+' : '-'}<KRW value={fee} /> 원
            </span>
          </div>
          <div className="border-t border-gray-700 pt-2 flex justify-between items-center">
            <span className="text-gray-400 font-medium">
              {mode === 'BUY' ? '총 필요 금액' : '예상 수령액'}
            </span>
            <span className={`text-2xl font-bold ${mode === 'BUY' ? (leverage > 1 ? 'text-yellow-500' : 'text-red-500') : 'text-blue-500'}`}>
              <KRW value={totalAmount} />
              <span className="text-sm text-gray-500 ml-1">원</span>
            </span>
          </div>
        </div>
        
        {/* 예약 주문 목록 */}
        {stockPendingOrders.length > 0 && (
          <div className="bg-gray-900 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-bold text-gray-400">대기 중인 예약 주문</h3>
            {stockPendingOrders.map((order) => (
              <div key={order.id} className="flex items-center justify-between bg-gray-800 rounded-lg p-3">
                <div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    order.side === 'buy' ? 'bg-red-500/20 text-red-400' : 'bg-blue-500/20 text-blue-400'
                  }`}>
                    {order.side === 'buy' ? '매수 예약' : '매도 예약'}
                  </span>
                  <p className="text-white text-sm mt-1">
                    {order.quantity}주 @ <KRW value={order.targetPrice} />원
                  </p>
                </div>
                <button
                  onClick={() => cancelPendingOrder(order.id)}
                  className="px-3 py-1 bg-gray-700 hover:bg-red-600 rounded text-sm text-gray-300 hover:text-white transition-colors"
                >
                  취소
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 주문 버튼 */}
      <div className="p-4 bg-gray-900 border-t border-gray-800">
        {stock.isDelisted ? (
          <button
            disabled
            className="w-full py-4 rounded-lg font-bold text-lg bg-gray-700 text-gray-500 cursor-not-allowed"
          >
            🚫 상장폐지 종목
          </button>
        ) : stock.tradingHalted ? (
          <button
            disabled
            className="w-full py-4 rounded-lg font-bold text-lg bg-yellow-900/50 text-yellow-600 cursor-not-allowed"
          >
            ⏸️ 거래정지 중
          </button>
        ) : orderType === 'market' ? (
          <button
            onClick={handleMarketOrder}
            disabled={!canMarketOrder || marketStatus === 'CLOSED'}
            className={`w-full py-4 rounded-lg font-bold text-lg transition-all active:scale-98 ${
              mode === 'BUY'
                ? leverage > 1 
                  ? 'bg-gradient-to-r from-yellow-600 to-orange-600 hover:from-yellow-500 hover:to-orange-500 text-white'
                  : 'bg-red-600 hover:bg-red-500 text-white'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {mode === 'BUY' 
              ? leverage > 1 
                ? `${leverage}x 레버리지 매수` 
                : '시장가 매수' 
              : '시장가 매도'}
          </button>
        ) : (
          <button
            onClick={handleLimitOrder}
            disabled={!canLimitOrder || marketStatus === 'CLOSED'}
            className={`w-full py-4 rounded-lg font-bold text-lg transition-all active:scale-98 ${
              mode === 'BUY'
                ? 'bg-purple-600 hover:bg-purple-500 text-white'
                : 'bg-purple-600 hover:bg-purple-500 text-white'
            } disabled:opacity-50 disabled:cursor-not-allowed`}
          >
            {mode === 'BUY' ? '매수 예약' : '매도 예약'}
          </button>
        )}
      </div>
    </div>
  );
};

export default OrderPage;
