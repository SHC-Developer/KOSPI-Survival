import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useGameStore } from '../store/gameStore';
import { useAuthStore } from '../store/authStore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase/config';

// 뒤로가기 아이콘
const BackIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19 12H5M12 19l-7-7 7-7"/>
  </svg>
);

// 숫자 포맷
const formatNumber = (num: number) => {
  return new Intl.NumberFormat('ko-KR').format(num);
};

interface OddEvenGameState {
  roundId: string;
  phase: 'betting' | 'result' | 'waiting'; // betting: 배팅중, result: 결과표시, waiting: 다음라운드대기
  bettingEndTime: number; // 배팅 마감 시간 (timestamp)
  resultTime?: number; // 결과 표시 시간
  result?: 'odd' | 'even' | null; // 홀 or 짝
  nextRoundTime?: number; // 다음 라운드 시작 시간
  totalOddBets: number;
  totalEvenBets: number;
  resultHistory?: ('odd' | 'even')[]; // 최근 10개 결과 히스토리
}

interface MyBet {
  choice: 'odd' | 'even';
  amount: number;
}

interface OddEvenGameProps {
  onBack: () => void;
}

const OddEvenGame: React.FC<OddEvenGameProps> = ({ onBack }) => {
  const { cash, cashGranted } = useGameStore();
  const { user, subscribeToOddEvenGame, saveGameData } = useAuthStore();
  
  const [gameState, setGameState] = useState<OddEvenGameState | null>(null);
  const [myBet, setMyBet] = useState<MyBet | null>(null);
  const [betAmount, setBetAmount] = useState<number>(100000); // 기본 10만원
  const [selectedChoice, setSelectedChoice] = useState<'odd' | 'even' | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultAnimation, setResultAnimation] = useState(false);
  const [showResult, setShowResult] = useState<'odd' | 'even' | null>(null);
  const [lastRoundResult, setLastRoundResult] = useState<{won: boolean, amount: number} | null>(null);
  
  const countdownRef = useRef<number | null>(null);
  const processedRoundsRef = useRef<Set<string>>(new Set());

  // 홀짝 게임 상태 구독
  useEffect(() => {
    if (!user) return;
    
    const unsubscribe = subscribeToOddEvenGame((data: OddEvenGameState) => {
      console.log('[OddEvenGame] Game state updated:', data);
      
      // 결과가 나왔을 때 애니메이션 트리거
      if (data.phase === 'result' && data.result && gameState?.phase === 'betting') {
        setResultAnimation(true);
        setShowResult(data.result);
        
        // 내 배팅 결과 확인
        if (myBet && !processedRoundsRef.current.has(data.roundId)) {
          processedRoundsRef.current.add(data.roundId);
          const won = myBet.choice === data.result;
          setLastRoundResult({ won, amount: myBet.amount });
          
          // 이겼으면 2배 지급 (배팅 시 이미 차감되었으므로 2배를 더함)
          if (won) {
            const { cash: currentCash, cashGranted: currentCashGranted, portfolio, gameTick, currentDay } = useGameStore.getState();
            const winnings = myBet.amount * 2; // 원금 + 상금 = 2배
            const newCash = currentCash + winnings;
            useGameStore.setState({ cash: newCash });
            saveGameData({
              cash: newCash,
              cashGranted: currentCashGranted,
              portfolio,
              gameTick,
              currentDay,
              lastUpdated: new Date()
            });
          }
          // 졌으면 이미 배팅 시 차감되었으므로 추가 처리 없음
        }
        
        // 3초 후 애니메이션 종료
        setTimeout(() => {
          setResultAnimation(false);
        }, 3000);
      }
      
      // 새 라운드 시작 시 배팅 초기화
      if (data.phase === 'betting' && gameState?.roundId !== data.roundId) {
        setMyBet(null);
        setSelectedChoice(null);
        setLastRoundResult(null);
        setShowResult(null);
      }
      
      setGameState(data);
    });
    
    return () => unsubscribe();
  }, [user, subscribeToOddEvenGame, gameState?.phase, gameState?.roundId, myBet, saveGameData]);

  // 카운트다운 타이머
  useEffect(() => {
    if (!gameState) return;
    
    const updateCountdown = () => {
      const now = Date.now();
      let targetTime = 0;
      
      if (gameState.phase === 'betting') {
        targetTime = gameState.bettingEndTime;
      } else if (gameState.phase === 'result' || gameState.phase === 'waiting') {
        targetTime = gameState.nextRoundTime || 0;
      }
      
      const remaining = Math.max(0, Math.ceil((targetTime - now) / 1000));
      setCountdown(remaining);
    };
    
    updateCountdown();
    countdownRef.current = window.setInterval(updateCountdown, 100);
    
    return () => {
      if (countdownRef.current) {
        clearInterval(countdownRef.current);
      }
    };
  }, [gameState]);

  // 배팅 제출
  const submitBet = useCallback(async () => {
    if (!selectedChoice || !user || isSubmitting) return;
    if (betAmount > cash) {
      alert('잔액이 부족합니다!');
      return;
    }
    if (betAmount > 1000000) {
      alert('최대 배팅 금액은 100만원입니다!');
      return;
    }
    if (betAmount < 100000 || betAmount % 100000 !== 0) {
      alert('배팅 금액은 10만원 단위로만 가능합니다!');
      return;
    }
    if (gameState?.phase !== 'betting') {
      alert('배팅 시간이 아닙니다!');
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const placeBet = httpsCallable(functions, 'placeOddEvenBet');
      const result = await placeBet({
        choice: selectedChoice,
        amount: betAmount,
        roundId: gameState.roundId
      });
      
      const response = result.data as { success: boolean; message?: string };
      
      if (response.success) {
        // 배팅 성공 - 잔액 차감
        const { cash: currentCash, cashGranted: currentCashGranted, portfolio, gameTick, currentDay } = useGameStore.getState();
        const newCash = currentCash - betAmount;
        useGameStore.setState({ cash: newCash });
        
        // Firebase에 저장
        saveGameData({
          cash: newCash,
          cashGranted: currentCashGranted,
          portfolio,
          gameTick,
          currentDay,
          lastUpdated: new Date()
        });
        
        setMyBet({ choice: selectedChoice, amount: betAmount });
      } else {
        alert(response.message || '배팅에 실패했습니다.');
      }
    } catch (error: any) {
      console.error('Bet error:', error);
      alert(error.message || '배팅 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedChoice, betAmount, user, isSubmitting, gameState, cash, saveGameData]);

  // 배팅 금액 조절
  const adjustBetAmount = (delta: number) => {
    const newAmount = Math.max(100000, Math.min(1000000, betAmount + delta));
    setBetAmount(newAmount);
  };

  const canBet = gameState?.phase === 'betting' && !myBet && countdown > 0;

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-b from-gray-900 via-gray-800 to-gray-900">
      {/* 페이지 타이틀 */}
      <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur border-b border-gray-800">
        <div className="max-w-lg mx-auto flex items-center justify-center px-4 py-3">
          <h1 className="text-lg font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-red-400">
            🎲 영혼의 홀/짝 게임
          </h1>
        </div>
      </div>

      {/* 메인 컨텐츠 */}
      <div className="pb-4 px-4">
        <div className="max-w-lg mx-auto">
          
          {/* 잔액 표시 */}
          <div className="bg-gray-800/50 rounded-xl p-4 mb-6 border border-gray-700">
            <div className="text-center">
              <span className="text-gray-400 text-sm">보유 자산</span>
              <div className="text-2xl font-bold text-white mt-1">
                ₩{formatNumber(cash)}
              </div>
            </div>
          </div>

          {/* 게임 상태 / 타이머 */}
          <div className="bg-gray-800/50 rounded-xl p-4 mb-6 border border-gray-700 text-center">
            {gameState?.phase === 'betting' && (
              <>
                <div className="text-orange-400 text-sm mb-1">배팅 진행 중</div>
                <div className="text-4xl font-mono font-bold text-white">
                  {countdown}초
                </div>
                <div className="text-gray-500 text-xs mt-1">배팅 마감까지</div>
              </>
            )}
            {(gameState?.phase === 'result' || gameState?.phase === 'waiting') && (
              <>
                <div className="text-blue-400 text-sm mb-1">
                  {gameState.phase === 'result' ? '결과 발표!' : '다음 라운드 대기'}
                </div>
                <div className="text-4xl font-mono font-bold text-white">
                  {countdown}초
                </div>
                <div className="text-gray-500 text-xs mt-1">다음 라운드까지</div>
              </>
            )}
            {!gameState && (
              <div className="text-gray-400">게임 로딩 중...</div>
            )}
          </div>

          {/* 결과 표시 (애니메이션) */}
          {resultAnimation && showResult && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
              <div className={`text-center animate-bounce ${showResult === 'odd' ? 'text-blue-500' : 'text-red-500'}`}>
                <div className="text-8xl font-black mb-4">
                  {showResult === 'odd' ? '홀' : '짝'}
                </div>
                {lastRoundResult && (
                  <div className={`text-2xl font-bold ${lastRoundResult.won ? 'text-green-400' : 'text-red-400'}`}>
                    {lastRoundResult.won 
                      ? `🎉 +₩${formatNumber(lastRoundResult.amount)} 획득!` 
                      : `😢 -₩${formatNumber(lastRoundResult.amount)} 손실`}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 최근 결과 히스토리 */}
          <div className="bg-gray-800/50 rounded-xl p-4 mb-6 border border-gray-700">
            <div className="text-center text-gray-400 text-sm mb-3">최근 결과</div>
            <div className="flex justify-center gap-2 flex-wrap">
              {gameState?.resultHistory && gameState.resultHistory.length > 0 ? (
                gameState.resultHistory.map((result, index) => (
                  <div
                    key={index}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${
                      result === 'odd' ? 'bg-blue-500' : 'bg-red-500'
                    }`}
                  >
                    {result === 'odd' ? '홀' : '짝'}
                  </div>
                ))
              ) : (
                <span className="text-gray-500 text-sm">결과 없음</span>
              )}
            </div>
            {gameState?.resultHistory && gameState.resultHistory.length > 0 && (
              <div className="flex justify-center gap-4 mt-3 text-xs">
                <span className="text-blue-400">
                  홀: {gameState.resultHistory.filter(r => r === 'odd').length}회
                </span>
                <span className="text-red-400">
                  짝: {gameState.resultHistory.filter(r => r === 'even').length}회
                </span>
              </div>
            )}
          </div>

          {/* 홀짝 선택 UI */}
          <div className="bg-gray-800/50 rounded-xl p-6 mb-6 border border-gray-700">
            <div className="text-center text-gray-400 text-sm mb-4">선택하세요</div>
            <div className="flex justify-center gap-8">
              <button
                onClick={() => canBet && setSelectedChoice('odd')}
                disabled={!canBet}
                className={`w-24 h-24 rounded-2xl flex flex-col items-center justify-center text-white font-bold transition-all transform ${
                  selectedChoice === 'odd' 
                    ? 'bg-blue-600 scale-110 ring-4 ring-blue-400 ring-opacity-50 shadow-lg shadow-blue-500/50' 
                    : 'bg-blue-500 hover:bg-blue-600'
                } ${!canBet ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
              >
                <span className="text-3xl mb-1">🔵</span>
                <span className="text-xl">홀</span>
              </button>
              <button
                onClick={() => canBet && setSelectedChoice('even')}
                disabled={!canBet}
                className={`w-24 h-24 rounded-2xl flex flex-col items-center justify-center text-white font-bold transition-all transform ${
                  selectedChoice === 'even' 
                    ? 'bg-red-600 scale-110 ring-4 ring-red-400 ring-opacity-50 shadow-lg shadow-red-500/50' 
                    : 'bg-red-500 hover:bg-red-600'
                } ${!canBet ? 'opacity-50 cursor-not-allowed' : 'hover:scale-105'}`}
              >
                <span className="text-3xl mb-1">🔴</span>
                <span className="text-xl">짝</span>
              </button>
            </div>
          </div>

          {/* 배팅 금액 조절 */}
          <div className="bg-gray-800/50 rounded-xl p-4 mb-4 border border-gray-700">
            <div className="text-center text-gray-400 text-sm mb-3">배팅 금액 (10만원 단위)</div>
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => adjustBetAmount(-100000)}
                disabled={!canBet || betAmount <= 100000}
                className="w-12 h-12 rounded-full bg-gray-700 text-white font-bold text-xl hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                -
              </button>
              <div className="text-2xl font-bold text-white min-w-[150px] text-center">
                ₩{formatNumber(betAmount)}
              </div>
              <button
                onClick={() => adjustBetAmount(100000)}
                disabled={!canBet || betAmount >= 1000000}
                className="w-12 h-12 rounded-full bg-gray-700 text-white font-bold text-xl hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                +
              </button>
            </div>
            <div className="text-center text-gray-500 text-xs mt-2">
              최소 10만원 / 최대 100만원
            </div>
          </div>

          {/* 배팅 버튼 */}
          {canBet && selectedChoice && (
            <button
              onClick={submitBet}
              disabled={isSubmitting || betAmount > cash}
              className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
                selectedChoice === 'odd'
                  ? 'bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400'
                  : 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400'
              } text-white shadow-lg disabled:opacity-50`}
            >
              {isSubmitting ? '배팅 중...' : `${selectedChoice === 'odd' ? '홀' : '짝'}에 ₩${formatNumber(betAmount)} 배팅하기`}
            </button>
          )}

          {/* 내 배팅 표시 */}
          {myBet && (
            <div className={`mt-4 p-4 rounded-xl border-2 ${
              myBet.choice === 'odd' ? 'bg-blue-900/30 border-blue-500' : 'bg-red-900/30 border-red-500'
            }`}>
              <div className="text-center">
                <div className="text-gray-400 text-sm">내 배팅</div>
                <div className={`text-2xl font-bold ${myBet.choice === 'odd' ? 'text-blue-400' : 'text-red-400'}`}>
                  {myBet.choice === 'odd' ? '홀' : '짝'} - ₩{formatNumber(myBet.amount)}
                </div>
                <div className="text-gray-500 text-xs mt-1">
                  당첨 시 ₩{formatNumber(myBet.amount * 2)} 획득
                </div>
              </div>
            </div>
          )}

          {/* 배팅 현황 */}
          <div className="mt-6 bg-gray-800/50 rounded-xl p-4 border border-gray-700">
            <div className="text-center text-gray-400 text-sm mb-3">실시간 배팅 현황</div>
            <div className="flex justify-between">
              <div className="text-center flex-1">
                <div className="text-blue-400 font-bold text-lg">홀</div>
                <div className="text-white">₩{formatNumber(gameState?.totalOddBets || 0)}</div>
              </div>
              <div className="w-px bg-gray-700"></div>
              <div className="text-center flex-1">
                <div className="text-red-400 font-bold text-lg">짝</div>
                <div className="text-white">₩{formatNumber(gameState?.totalEvenBets || 0)}</div>
              </div>
            </div>
          </div>

          {/* 게임 규칙 */}
          <div className="mt-6 bg-gray-800/30 rounded-xl p-4 border border-gray-700/50">
            <div className="text-orange-400 font-bold text-sm mb-2">🎲 게임 규칙</div>
            <ul className="text-gray-400 text-xs space-y-1">
              <li>• 배팅 시간: 30초</li>
              <li>• 배팅 금액: 10만원 ~ 100만원 (10만원 단위)</li>
              <li>• 당첨 시 배팅금의 2배 획득</li>
              <li>• 확률: 정확히 50:50</li>
              <li>• 결과 발표 후 5초 대기, 새 라운드 시작</li>
            </ul>
          </div>

        </div>
      </div>
    </div>
  );
};

export default OddEvenGame;

