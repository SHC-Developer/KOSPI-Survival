import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useGameStore } from './store/gameStore';
import { useAuthStore, NewsEventData } from './store/authStore';
import BottomNav from './components/BottomNav';
import WatchlistPage from './components/WatchlistPage';
import StockPricePage from './components/StockPricePage';
import OrderPage from './components/OrderPage';
import PortfolioPage from './components/PortfolioPage';
import RankingPage from './components/RankingPage';
import AuthPage from './components/AuthPage';
import AdminPage from './components/AdminPage';
import { NewsEvent } from './types';

// Icons
const RefreshIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
);
const PauseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
);
const PlayIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
);

// Logout Icon
const LogoutIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
    <polyline points="16 17 21 12 16 7"/>
    <line x1="21" y1="12" x2="9" y2="12"/>
  </svg>
);

// Close Icon
const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);

// 팝업 타입 정의
type PopupType = 'news' | 'order';

interface PopupItem {
  id: string;
  type: PopupType;
  data: any;
  timestamp: number;
}

// 알림 팝업 컴포넌트 (뉴스, 주문 체결 등)
interface AlertPopupProps {
  popup: PopupItem;
  index: number;
  onClose: (id: string) => void;
}

const AlertPopup: React.FC<AlertPopupProps> = ({ popup, index, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose(popup.id);
    }, 5000);
    return () => clearTimeout(timer);
  }, [popup.id, onClose]);

  // 스택 효과: 아래로 갈수록 offset (70px씩 아래로)
  const topOffset = 56 + (index * 70); // 56px 기본 + 70px씩 아래로
  const scale = 1 - (index * 0.02);
  const opacity = 1 - (index * 0.15);

  if (popup.type === 'news') {
    const news = popup.data as NewsEvent;
    const isGood = news.effect === 'GOOD';
    
    return (
      <div 
        className="fixed left-0 right-0 z-[60] flex justify-center px-4 animate-slide-down transition-all duration-300"
        style={{ 
          top: `${topOffset}px`,
          transform: `scale(${scale})`,
          opacity: opacity,
          zIndex: 60 - index
        }}
      >
        <div className={`max-w-lg w-full rounded-lg shadow-2xl border ${
          isGood 
            ? 'bg-gradient-to-r from-red-900/95 to-red-800/95 border-red-600' 
            : 'bg-gradient-to-r from-blue-900/95 to-blue-800/95 border-blue-600'
        } backdrop-blur`}>
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{isGood ? '📈' : '📉'}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    isGood ? 'bg-red-500/30 text-red-300' : 'bg-blue-500/30 text-blue-300'
                  }`}>
                    {isGood ? '호재' : '악재'}
                  </span>
                  <span className="text-xs text-gray-400">방금 전</span>
                </div>
                <p className="text-white font-medium text-sm">{news.title}</p>
                <p className="text-gray-300 text-xs mt-1">{news.description}</p>
              </div>
              <button 
                onClick={() => onClose(popup.id)}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="mt-3 h-1 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className={`h-full ${isGood ? 'bg-red-500' : 'bg-blue-500'}`}
                style={{ animation: 'progress 5s linear forwards' }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 주문 체결 팝업
  if (popup.type === 'order') {
    const order = popup.data as { stockName: string; side: 'buy' | 'sell'; quantity: number; price: number };
    const isBuy = order.side === 'buy';
    
    return (
      <div 
        className="fixed left-0 right-0 z-[60] flex justify-center px-4 animate-slide-down transition-all duration-300"
        style={{ 
          top: `${topOffset}px`,
          transform: `scale(${scale})`,
          opacity: opacity,
          zIndex: 60 - index
        }}
      >
        <div className={`max-w-lg w-full rounded-lg shadow-2xl border ${
          isBuy 
            ? 'bg-gradient-to-r from-red-900/95 to-red-800/95 border-red-600' 
            : 'bg-gradient-to-r from-blue-900/95 to-blue-800/95 border-blue-600'
        } backdrop-blur`}>
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">{isBuy ? '🔔' : '🔔'}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                    isBuy ? 'bg-red-500/30 text-red-300' : 'bg-blue-500/30 text-blue-300'
                  }`}>
                    예약 주문 체결
                  </span>
                </div>
                <p className="text-white font-medium text-sm">
                  {order.stockName} {order.quantity}주 {isBuy ? '매수' : '매도'} 완료
                </p>
                <p className="text-gray-300 text-xs mt-1">
                  체결가: {order.price.toLocaleString()}원 | 총액: {(order.price * order.quantity).toLocaleString()}원
                </p>
              </div>
              <button 
                onClick={() => onClose(popup.id)}
                className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
              >
                <CloseIcon />
              </button>
            </div>
            <div className="mt-3 h-1 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className={`h-full ${isBuy ? 'bg-red-500' : 'bg-blue-500'}`}
                style={{ animation: 'progress 5s linear forwards' }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return null;
};

const App: React.FC = () => {
  const { 
    initialize, 
    loadFromFirebase, 
    loadStockPricesFromFirebase,
    updateGameTick,
    setNewsEvents,
    cash,
    cashGranted, // 관리자 지급 금액
    portfolio, 
    stocks,
    gameTick,
    currentDay,
    currentPage,
    latestNews,
    clearLatestNews,
    setPage,
    isMarketClosed,
    marketClosingMessage,
    dayProgress,
    executedOrders,
    clearExecutedOrders
  } = useGameStore();
  
  const [popupStack, setPopupStack] = useState<PopupItem[]>([]);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [nicknameError, setNicknameError] = useState('');
  const [currentUserNickname, setCurrentUserNickname] = useState<string | null>(null);
  const shownNewsIdsRef = useRef<Set<string>>(new Set());
  const [showMarketClosedPopup, setShowMarketClosedPopup] = useState(true); // 장 마감 팝업 표시 여부
  
  const { 
    user, 
    isLoading: authLoading, 
    isInitialized, 
    initialize: initAuth, 
    logout, 
    saveGameData, 
    loadGameData, 
    isAdmin,
    updateNickname,
    canChangeNickname,
    loadStockPrices,
    subscribeToStockPrices,
    subscribeToNewsEvents,
    startRealtimeSync
  } = useAuthStore();
  
  const saveIntervalRef = useRef<number | null>(null);
  const lastSavedDataRef = useRef<{ cash: number; portfolio: any[]; totalAsset: number; gameTick: number; currentDay: number } | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);
  
  // Initialize Auth
  useEffect(() => {
    initAuth();
  }, [initAuth]);

  // Load game data when user logs in
  useEffect(() => {
    const loadData = async () => {
      if (user && !dataLoaded) {
        console.log('[App] Loading game data for user:', user.email);
        const data = await loadGameData();
        
        if (data) {
          console.log('[App] Game data loaded:', { 
            cash: data.cash, 
            cashGranted: data.cashGranted,
            gameTick: data.gameTick, 
            nickname: data.nickname,
            nicknameType: typeof data.nickname,
            portfolioCount: data.portfolio?.length || 0
          });
          loadFromFirebase(data.cash, data.portfolio, data.gameTick, data.cashGranted || 0);
          
          // 닉네임 저장
          const hasNickname = data.nickname && typeof data.nickname === 'string' && data.nickname.trim().length > 0;
          if (hasNickname) {
            setCurrentUserNickname(data.nickname!);
          }
          
          // 신규 가입자만 닉네임 설정 모달 표시 (기존 유저는 표시하지 않음)
          // createdAt이 없거나 닉네임이 없는 "신규" 유저만 표시
          const isNewUser = !data.lastUpdated || (Date.now() - new Date(data.lastUpdated).getTime() < 60000);
          
          if (!hasNickname && isNewUser) {
            console.log('[App] New user without nickname, showing modal');
            setShowNicknameModal(true);
          }
        } else {
          console.log('[App] No data found in Firebase, using defaults');
          // 신규 유저: 닉네임 설정 필요
          setShowNicknameModal(true);
        }
        
        // Firebase에서 주가 로드
        const stockPrices = await loadStockPrices();
        if (stockPrices) {
          console.log('[App] Stock prices loaded from Firebase');
          loadStockPricesFromFirebase(stockPrices);
        } else {
          console.log('[App] No stock prices in Firebase, using initial prices');
        }
        
        setDataLoaded(true);
        initialize();
      }
    };
    loadData();
  }, [user, dataLoaded, loadGameData, loadFromFirebase, initialize, loadStockPrices, loadStockPricesFromFirebase]);

  // Subscribe to real-time stock price updates from Firebase
  useEffect(() => {
    if (!user || !dataLoaded) return;
    
    console.log('[App] Subscribing to stock price updates');
    const unsubscribe = subscribeToStockPrices((prices) => {
      loadStockPricesFromFirebase(prices);
    });
    
    return () => {
      console.log('[App] Unsubscribing from stock price updates');
      unsubscribe();
    };
  }, [user, dataLoaded, subscribeToStockPrices, loadStockPricesFromFirebase]);

  // Subscribe to news events from Firebase
  useEffect(() => {
    if (!user || !dataLoaded) return;
    
    console.log('[App] Subscribing to news events');
    const unsubscribe = subscribeToNewsEvents((events: NewsEventData[]) => {
      if (events.length > 0) {
        // NewsEventData를 NewsEvent로 변환
        const convertedEvents: NewsEvent[] = events.map(e => ({
          ...e,
          resolved: false,
        }));
        setNewsEvents(convertedEvents);
      }
    });
    
    return () => {
      console.log('[App] Unsubscribing from news events');
      unsubscribe();
    };
  }, [user, dataLoaded, subscribeToNewsEvents, setNewsEvents]);

  // 사용자 데이터 실시간 동기화 (cash, cashGranted만)
  // 관리자 지급 금액이나 Firebase에서 직접 수정한 값이 즉시 반영됨
  useEffect(() => {
    if (!user || !dataLoaded) return;
    
    console.log('[App] Starting realtime sync for user data');
    const unsubscribe = startRealtimeSync((data) => {
      // cash와 cashGranted만 실시간으로 업데이트
      // gameTick이나 currentDay는 서버에서 관리하므로 무시
      const currentState = useGameStore.getState();
      
      // Firebase에서 받은 cash/cashGranted가 다르면 업데이트
      if (data.cash !== currentState.cash || data.cashGranted !== currentState.cashGranted) {
        console.log('[App] Realtime cash update:', { 
          old: { cash: currentState.cash, cashGranted: currentState.cashGranted },
          new: { cash: data.cash, cashGranted: data.cashGranted }
        });
        useGameStore.setState({ 
          cash: data.cash, 
          cashGranted: data.cashGranted 
        });
        // lastSavedDataRef도 업데이트하여 불필요한 재저장 방지
        if (lastSavedDataRef.current) {
          lastSavedDataRef.current.cash = data.cash;
        }
      }
      
      // portfolio도 실시간으로 업데이트 (다른 기기에서 거래한 경우)
      if (JSON.stringify(data.portfolio) !== JSON.stringify(currentState.portfolio)) {
        console.log('[App] Realtime portfolio update');
        useGameStore.setState({ portfolio: data.portfolio });
        if (lastSavedDataRef.current) {
          lastSavedDataRef.current.portfolio = data.portfolio;
        }
      }
    });
    
    return () => {
      console.log('[App] Stopping realtime sync');
      unsubscribe();
    };
  }, [user, dataLoaded, startRealtimeSync]);

  // 총잔고 계산 (메모이제이션)
  const totalAsset = useMemo(() => {
    const totalStockValue = portfolio.reduce((sum, item) => {
      const stock = stocks.find(s => s.id === item.stockId);
      return sum + (stock ? stock.currentPrice * item.quantity : 0);
    }, 0);
    return cash + totalStockValue;
  }, [cash, portfolio, stocks]);

  // 10초 간격으로 델타 업데이트 저장
  useEffect(() => {
    if (!user || !dataLoaded) return;
    
    const currentData = { cash, portfolio, totalAsset, gameTick, currentDay };
    
    // 초기 저장
    if (!lastSavedDataRef.current) {
      console.log('[App] Initial save to Firebase:', { cash, cashGranted, gameTick, currentDay });
      saveGameData({
        cash,
        cashGranted, // 관리자 지급 금액 전달
        portfolio,
        gameTick,
        currentDay,
        totalAsset,
        lastUpdated: new Date()
      });
      lastSavedDataRef.current = currentData;
    }
    
    // 10초마다 저장 (델타 업데이트)
    saveIntervalRef.current = window.setInterval(() => {
      const { cash: currentCash, cashGranted: currentCashGranted, portfolio: currentPortfolio, gameTick: currentGameTick, currentDay: currentDayNow } = useGameStore.getState();
      const newTotalAsset = totalAsset; // useMemo로 계산된 값 사용
      const newData = { cash: currentCash, portfolio: currentPortfolio, totalAsset: newTotalAsset, gameTick: currentGameTick, currentDay: currentDayNow };
      
      // 델타 체크
      const changed = !lastSavedDataRef.current ||
        lastSavedDataRef.current.cash !== currentCash ||
        JSON.stringify(lastSavedDataRef.current.portfolio) !== JSON.stringify(currentPortfolio) ||
        Math.abs((lastSavedDataRef.current.totalAsset || 0) - newTotalAsset) > 1 ||
        lastSavedDataRef.current.gameTick !== currentGameTick;
      
      if (changed) {
        console.log('[App] Saving to Firebase:', { cash: currentCash, cashGranted: currentCashGranted, gameTick: currentGameTick, currentDay: currentDayNow });
        saveGameData({
          cash: currentCash,
          cashGranted: currentCashGranted, // 관리자 지급 금액 전달
          portfolio: currentPortfolio,
          gameTick: currentGameTick,
          currentDay: currentDayNow,
          totalAsset: newTotalAsset,
          lastUpdated: new Date()
        });
        lastSavedDataRef.current = newData;
      }
    }, 10000);
    
    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, [user, dataLoaded, saveGameData, cashGranted]);

  // Reset dataLoaded when user logs out
  useEffect(() => {
    if (!user) {
      setDataLoaded(false);
    }
  }, [user]);

  // 장이 개장되면 다음 마감 시 팝업 다시 표시
  useEffect(() => {
    if (!isMarketClosed) {
      setShowMarketClosedPopup(true);
    }
  }, [isMarketClosed]);

  // 새 뉴스가 발생하면 팝업 스택에 추가 (중복 방지)
  useEffect(() => {
    if (latestNews && !shownNewsIdsRef.current.has(latestNews.id)) {
      // 이미 표시한 뉴스가 아니면 팝업 추가
      shownNewsIdsRef.current.add(latestNews.id);
      
      const newPopup: PopupItem = {
        id: `news-${latestNews.id}-${Date.now()}`,
        type: 'news',
        data: latestNews,
        timestamp: Date.now()
      };
      setPopupStack(prev => [newPopup, ...prev].slice(0, 5)); // 최대 5개까지
      clearLatestNews();
      
      // 메모리 절약을 위해 오래된 뉴스 ID 제거 (100개 이상일 때)
      if (shownNewsIdsRef.current.size > 100) {
        const idsArray = Array.from(shownNewsIdsRef.current);
        shownNewsIdsRef.current = new Set(idsArray.slice(-50)); // 최근 50개만 유지
      }
    }
  }, [latestNews, clearLatestNews]);

  // 예약 주문 체결 감지 (gameStore의 executedOrders 사용)
  useEffect(() => {
    if (executedOrders.length > 0) {
      executedOrders.forEach(order => {
        const orderPopup: PopupItem = {
          id: `order-${order.orderId}-${Date.now()}`,
          type: 'order',
          data: {
            stockName: order.stockName,
            side: order.side,
            quantity: order.quantity,
            price: order.price
          },
          timestamp: Date.now()
        };
        setPopupStack(prev => [orderPopup, ...prev].slice(0, 5));
      });
      clearExecutedOrders();
    }
  }, [executedOrders, clearExecutedOrders]);
  
  // 팝업 닫기 핸들러
  const handleClosePopup = useCallback((id: string) => {
    setPopupStack(prev => prev.filter(p => p.id !== id));
  }, []);

  // 닉네임 설정 핸들러
  const handleSetNickname = async () => {
    if (!nicknameInput.trim()) {
      setNicknameError('닉네임을 입력해주세요.');
      return;
    }
    
    if (nicknameInput.trim().length > 20) {
      setNicknameError('닉네임은 20자 이하여야 합니다.');
      return;
    }
    
    const canChange = await canChangeNickname();
    if (!canChange) {
      setNicknameError('닉네임은 210분(일주일)에 한 번만 변경할 수 있습니다.');
      return;
    }
    
    const success = await updateNickname(nicknameInput.trim());
    if (success) {
      setCurrentUserNickname(nicknameInput.trim());
      setShowNicknameModal(false);
      setNicknameInput('');
      setNicknameError('');
    } else {
      // 중복 체크 실패 또는 기타 오류
      setNicknameError('이미 사용 중인 닉네임이거나 설정에 실패했습니다.');
    }
  };

  // Game Loop - 주가는 서버(Cloud Functions)에서만 업데이트됨
  useEffect(() => {
    if (dataLoaded) {
      initialize();
    }
  }, [initialize, dataLoaded]);

  // 로컬 tick() 제거됨 - 주가는 Firebase에서 실시간 구독으로만 업데이트

  // Show loading while checking auth
  if (!isInitialized || authLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">로딩 중...</p>
        </div>
      </div>
    );
  }

  // Show auth page if not logged in
  if (!user) {
    return <AuthPage />;
  }

  // Show admin page if user is admin
  if (isAdmin()) {
    return <AdminPage />;
  }

  // Show loading while data is being loaded
  if (!dataLoaded) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-400">게임 데이터 불러오는 중...</p>
        </div>
      </div>
    );
  }

  // 장 마감 오버레이 - 서버에서 관리하므로 클라이언트에서는 표시하지 않음
  // const showMarketClosedOverlay = marketStatus === 'CLOSED' && closingCountdown > 0;

  // 현재 페이지 렌더링
  const renderPage = () => {
    switch (currentPage) {
      case 'watchlist':
        return <WatchlistPage />;
      case 'price':
        return <StockPricePage />;
      case 'order':
        return <OrderPage />;
      case 'portfolio':
        return <PortfolioPage />;
      case 'ranking':
        return <RankingPage />;
      default:
        return <WatchlistPage />;
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 max-w-lg mx-auto relative">
      {/* 장 마감 팝업 (닫기 가능) */}
      {isMarketClosed && marketClosingMessage && showMarketClosedPopup && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[110] w-[90%] max-w-sm transition-all duration-300">
          <div className="bg-gray-800 border border-orange-500/50 rounded-xl shadow-2xl shadow-orange-500/20 p-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="text-3xl">🔔</div>
                <div>
                  <h2 className="text-base font-bold text-orange-400">장 마감</h2>
                  <p className="text-sm text-gray-300 mt-1">
                    {marketClosingMessage}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowMarketClosedPopup(false)}
                className="text-gray-500 hover:text-gray-300 p-1"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex items-center gap-2 text-gray-400 text-xs mt-3 pt-3 border-t border-gray-700">
              <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></div>
              <span>다음 장 개장을 기다리는 중...</span>
            </div>
          </div>
        </div>
      )}

      {/* 알림 팝업 스택 (뉴스, 주문 체결 등) */}
      {popupStack.map((popup, index) => (
        <AlertPopup 
          key={popup.id} 
          popup={popup} 
          index={index} 
          onClose={handleClosePopup} 
        />
      ))}
      
      {/* 상단 컨트롤 바 */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur border-b border-gray-800 safe-area-top">
        <div className="max-w-lg mx-auto flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
              KOSPI Survival
            </h1>
            <span className="text-xs text-gray-500">Day {currentDay}</span>
          </div>
          
          <div className="flex items-center gap-3">
            {/* 하루 진행률 바 */}
            {!isMarketClosed && (
              <div className="flex items-center gap-2">
                <div className="w-20 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-1000"
                    style={{ width: `${dayProgress}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">{dayProgress}%</span>
              </div>
            )}
            {isMarketClosed && (
              <span className="text-xs text-orange-400 animate-pulse">휴장 중</span>
            )}
            
            {/* 닉네임 표시 */}
            {currentUserNickname && (
              <span className="text-xs text-gray-400 max-w-[80px] truncate" title={currentUserNickname}>
                {currentUserNickname}
              </span>
            )}
            
            <button 
              onClick={() => { if(confirm('로그아웃 하시겠습니까?')) logout(); }}
              className="p-2 text-gray-400 hover:text-red-400 transition-colors"
              title="로그아웃"
            >
              <LogoutIcon />
            </button>
          </div>
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <main className="flex-1 overflow-hidden pt-12 pb-16">
        {renderPage()}
      </main>

      {/* 하단 네비게이션 */}
      <BottomNav />

      {/* 닉네임 설정 모달 */}
      {showNicknameModal && (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-white mb-2">닉네임 설정</h2>
            <p className="text-sm text-gray-400 mb-4">
              거래를 시작하기 전에 닉네임을 설정해주세요.
              <br />
              닉네임은 210분(일주일)에 한 번만 변경할 수 있습니다.
            </p>
            
            <input
              type="text"
              value={nicknameInput}
              onChange={(e) => {
                setNicknameInput(e.target.value);
                setNicknameError('');
              }}
              placeholder="닉네임을 입력하세요 (최대 20자)"
              maxLength={20}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 mb-2"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSetNickname();
                }
              }}
            />
            
            {nicknameError && (
              <p className="text-red-400 text-sm mb-4">{nicknameError}</p>
            )}
            
            <div className="flex gap-2">
              <button
                onClick={handleSetNickname}
                className="flex-1 py-3 bg-orange-600 hover:bg-orange-500 rounded-lg font-bold text-white transition-colors"
              >
                설정
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
