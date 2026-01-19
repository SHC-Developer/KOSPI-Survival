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

// 뉴스 팝업 컴포넌트
interface NewsPopupProps {
  news: NewsEvent;
  onClose: () => void;
}

const NewsPopup: React.FC<NewsPopupProps> = ({ news, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 5000);
    return () => clearTimeout(timer);
  }, [news.id, onClose]);

  const isGood = news.effect === 'GOOD';
  
  return (
    <div className={`fixed top-14 left-0 right-0 z-[60] flex justify-center px-4 animate-slide-down`}>
      <div className={`max-w-lg w-full rounded-lg shadow-2xl border ${
        isGood 
          ? 'bg-gradient-to-r from-red-900/95 to-red-800/95 border-red-600' 
          : 'bg-gradient-to-r from-blue-900/95 to-blue-800/95 border-blue-600'
      } backdrop-blur`}>
        <div className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-lg ${isGood ? '📈' : '📉'}`}>
                  {isGood ? '📈' : '📉'}
                </span>
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
              onClick={onClose}
              className="p-1.5 hover:bg-white/10 rounded-full transition-colors text-gray-400 hover:text-white"
            >
              <CloseIcon />
            </button>
          </div>
          {/* 5초 진행 바 */}
          <div className="mt-3 h-1 bg-gray-700 rounded-full overflow-hidden">
            <div 
              className={`h-full ${isGood ? 'bg-red-500' : 'bg-blue-500'} animate-progress`}
              style={{ animation: 'progress 5s linear forwards' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const { 
    initialize, 
    loadFromFirebase, 
    loadStockPricesFromFirebase,
    updateGameTick,
    setNewsEvents,
    cash, 
    portfolio, 
    stocks,
    gameTick,
    currentDay,
    currentPage,
    latestNews,
    clearLatestNews,
    setPage,
    isNewsPhase,
    newsPhaseCountdown,
    newsWarningActive
  } = useGameStore();
  
  const [showNewsPopup, setShowNewsPopup] = useState<NewsEvent | null>(null);
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');
  const [nicknameError, setNicknameError] = useState('');
  
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
    subscribeToNewsEvents
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
            gameTick: data.gameTick, 
            nickname: data.nickname,
            nicknameType: typeof data.nickname,
            portfolioCount: data.portfolio?.length || 0
          });
          loadFromFirebase(data.cash, data.portfolio, data.gameTick);
          
          // 신규 가입자 또는 닉네임이 없으면 닉네임 설정 모달 표시
          // nickname이 null, undefined, 또는 빈 문자열인 경우에만 모달 표시
          const hasNickname = data.nickname && typeof data.nickname === 'string' && data.nickname.trim().length > 0;
          console.log('[App] Has nickname:', hasNickname, 'Value:', data.nickname);
          
          if (!hasNickname) {
            console.log('[App] No nickname found, showing modal');
            setShowNicknameModal(true);
          }
        } else {
          console.log('[App] No data found in Firebase, using defaults');
          // 데이터가 없는 경우도 닉네임 설정 필요
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

  // 실시간 동기화는 비활성화 - 로컬 게임 상태가 Firebase에 의해 덮어씌워지는 문제 방지
  // Firebase는 10초마다 저장만 하고, 로드는 페이지 로드 시 한 번만 수행
  // 다른 탭/기기에서의 변경사항 동기화가 필요하면 별도 로직 필요

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
      console.log('[App] Initial save to Firebase:', { cash, gameTick, currentDay });
      saveGameData({
        cash,
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
      const { cash: currentCash, portfolio: currentPortfolio, gameTick: currentGameTick, currentDay: currentDayNow } = useGameStore.getState();
      const newTotalAsset = totalAsset; // useMemo로 계산된 값 사용
      const newData = { cash: currentCash, portfolio: currentPortfolio, totalAsset: newTotalAsset, gameTick: currentGameTick, currentDay: currentDayNow };
      
      // 델타 체크
      const changed = !lastSavedDataRef.current ||
        lastSavedDataRef.current.cash !== currentCash ||
        JSON.stringify(lastSavedDataRef.current.portfolio) !== JSON.stringify(currentPortfolio) ||
        Math.abs((lastSavedDataRef.current.totalAsset || 0) - newTotalAsset) > 1 ||
        lastSavedDataRef.current.gameTick !== currentGameTick;
      
      if (changed) {
        console.log('[App] Saving to Firebase:', { cash: currentCash, gameTick: currentGameTick, currentDay: currentDayNow });
        saveGameData({
          cash: currentCash,
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
  }, [user, dataLoaded, saveGameData]);

  // Reset dataLoaded when user logs out
  useEffect(() => {
    if (!user) {
      setDataLoaded(false);
    }
  }, [user]);

  // 새 뉴스가 발생하면 팝업 표시
  useEffect(() => {
    if (latestNews) {
      setShowNewsPopup(latestNews);
    }
  }, [latestNews]);
  
  // 팝업 닫기 핸들러
  const handleCloseNewsPopup = useCallback(() => {
    setShowNewsPopup(null);
    clearLatestNews();
  }, [clearLatestNews]);

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
      {/* 뉴스 경고 팝업 (3초) */}
      {newsWarningActive && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="text-center animate-pulse">
            <div className="text-6xl mb-6">📰</div>
            <h2 className="text-2xl font-bold text-yellow-400 mb-3">
              잠시 거래를 멈추고
            </h2>
            <h2 className="text-2xl font-bold text-yellow-400 mb-6">
              뉴스에 집중해주세요
            </h2>
            <div className="text-gray-400 text-sm">
              곧 중요한 뉴스가 발표됩니다...
            </div>
          </div>
        </div>
      )}

      {/* 뉴스 페이즈 카운트다운 */}
      {isNewsPhase && !newsWarningActive && newsPhaseCountdown > 0 && (
        <div className="fixed top-14 left-0 right-0 z-[55] flex justify-center px-4">
          <div className="bg-gradient-to-r from-purple-900/95 to-indigo-900/95 border border-purple-600 rounded-lg px-4 py-2 shadow-xl">
            <span className="text-purple-300 text-sm font-medium">
              📰 뉴스 타임 - {newsPhaseCountdown}초 후 거래 재개
            </span>
          </div>
        </div>
      )}

      {/* 뉴스 팝업 */}
      {showNewsPopup && !newsWarningActive && (
        <NewsPopup news={showNewsPopup} onClose={handleCloseNewsPopup} />
      )}
      
      {/* 상단 컨트롤 바 */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur border-b border-gray-800 safe-area-top">
        <div className="max-w-lg mx-auto flex items-center justify-between px-3 py-2">
          <h1 className="text-sm font-bold bg-gradient-to-r from-red-500 to-orange-500 bg-clip-text text-transparent">
            KOSPI Survival
          </h1>
          
          <div className="flex items-center gap-2">
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
