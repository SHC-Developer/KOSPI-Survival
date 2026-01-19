import React, { useEffect, useState, useRef } from 'react';
import { useAuthStore, UserInfo } from '../store/authStore';
import { useGameStore } from '../store/gameStore';

const AdminPage: React.FC = () => {
  const { getAllUsers, addCashToUser, deleteUser, logout, user, saveStockPrices } = useAuthStore();
  const { tick, stocks, getStockPricesForFirebase, initialize } = useGameStore();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserInfo | null>(null);
  const [amount, setAmount] = useState<string>('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isMarketRunning, setIsMarketRunning] = useState(false);
  const tickIntervalRef = useRef<number | null>(null);
  const saveIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    loadUsers();
    initialize();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    const userList = await getAllUsers();
    setUsers(userList);
    setLoading(false);
  };

  // 주가 서버 시작/중지
  const toggleMarket = () => {
    if (isMarketRunning) {
      // 중지
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
        tickIntervalRef.current = null;
      }
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
        saveIntervalRef.current = null;
      }
      setIsMarketRunning(false);
      setMessage({ type: 'success', text: '주가 서버가 중지되었습니다.' });
    } else {
      // 시작
      // 1초마다 주가 업데이트
      tickIntervalRef.current = window.setInterval(() => {
        tick();
      }, 1000);

      // 10초마다 Firebase에 저장
      saveIntervalRef.current = window.setInterval(() => {
        const prices = getStockPricesForFirebase();
        saveStockPrices(prices);
      }, 10000);

      // 시작 시 바로 한 번 저장
      const prices = getStockPricesForFirebase();
      saveStockPrices(prices);

      setIsMarketRunning(true);
      setMessage({ type: 'success', text: '주가 서버가 시작되었습니다. 모든 유저에게 실시간 주가가 동기화됩니다.' });
    }
    setTimeout(() => setMessage(null), 3000);
  };

  // 컴포넌트 언마운트 시 정리
  useEffect(() => {
    return () => {
      if (tickIntervalRef.current) {
        clearInterval(tickIntervalRef.current);
      }
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
    };
  }, []);

  const handleAddCash = async () => {
    if (!selectedUser || !amount) return;
    
    const amountNum = parseInt(amount.replace(/,/g, ''));
    if (isNaN(amountNum) || amountNum === 0) {
      setMessage({ type: 'error', text: '유효한 금액을 입력해주세요.' });
      return;
    }

    const success = await addCashToUser(selectedUser.uid, amountNum);
    
    if (success) {
      setMessage({ type: 'success', text: `${selectedUser.email}에게 ${amountNum.toLocaleString()}원을 지급했습니다.` });
      setAmount('');
      setSelectedUser(null);
      loadUsers(); // 목록 새로고침
    } else {
      setMessage({ type: 'error', text: '금액 지급에 실패했습니다.' });
    }

    setTimeout(() => setMessage(null), 3000);
  };

  const handleDeleteUser = async (targetUser: UserInfo) => {
    if (targetUser.uid === user?.uid) {
      setMessage({ type: 'error', text: '자기 자신은 삭제할 수 없습니다.' });
      setTimeout(() => setMessage(null), 3000);
      return;
    }

    if (!confirm(`정말로 ${targetUser.email} (${targetUser.nickname || '닉네임 없음'}) 사용자를 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) {
      return;
    }

    const success = await deleteUser(targetUser.uid);
    
    if (success) {
      setMessage({ type: 'success', text: `${targetUser.email} 사용자가 삭제되었습니다.` });
      loadUsers(); // 목록 새로고침
    } else {
      setMessage({ type: 'error', text: '사용자 삭제에 실패했습니다.' });
    }

    setTimeout(() => setMessage(null), 3000);
  };

  const formatDate = (date: Date | null) => {
    if (!date) return '-';
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* 헤더 */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-orange-500">🔐 관리자 페이지</h1>
            <p className="text-xs text-gray-500 mt-1">로그인: {user?.email}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleMarket}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${
                isMarketRunning 
                  ? 'bg-red-600 hover:bg-red-500 text-white' 
                  : 'bg-green-600 hover:bg-green-500 text-white'
              }`}
            >
              {isMarketRunning ? '🛑 주가서버 중지' : '▶️ 주가서버 시작'}
            </button>
            <button
              onClick={() => { if(confirm('로그아웃 하시겠습니까?')) logout(); }}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 space-y-6">
        {/* 알림 메시지 */}
        {message && (
          <div className={`p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-900/50 border border-green-700 text-green-400' : 'bg-red-900/50 border border-red-700 text-red-400'
          }`}>
            {message.text}
          </div>
        )}

        {/* 주가 서버 상태 */}
        <div className={`bg-gray-900 rounded-xl p-6 border ${isMarketRunning ? 'border-green-600' : 'border-gray-800'}`}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">
              📊 주가 서버 상태: {isMarketRunning ? <span className="text-green-400">운영 중</span> : <span className="text-red-400">중지됨</span>}
            </h2>
            <span className={`px-3 py-1 rounded-full text-xs font-bold ${isMarketRunning ? 'bg-green-600/30 text-green-400' : 'bg-gray-700 text-gray-400'}`}>
              {isMarketRunning ? '🟢 LIVE' : '⭕ OFF'}
            </span>
          </div>
          
          {isMarketRunning && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
              {stocks.slice(0, 10).map(stock => {
                const change = ((stock.currentPrice - stock.previousClose) / stock.previousClose * 100);
                const isUp = change >= 0;
                return (
                  <div key={stock.id} className="bg-gray-800 rounded-lg p-2">
                    <p className="text-xs text-gray-400 truncate">{stock.name}</p>
                    <p className={`font-bold ${isUp ? 'text-red-400' : 'text-blue-400'}`}>
                      {stock.currentPrice.toLocaleString()}
                    </p>
                    <p className={`text-xs ${isUp ? 'text-red-500' : 'text-blue-500'}`}>
                      {isUp ? '+' : ''}{change.toFixed(2)}%
                    </p>
                  </div>
                );
              })}
            </div>
          )}
          
          {!isMarketRunning && (
            <p className="text-gray-500 text-sm">
              주가 서버를 시작하면 모든 유저에게 실시간으로 주가가 동기화됩니다.
              <br />
              서버가 중지되면 유저들은 마지막 저장된 주가를 사용합니다.
            </p>
          )}
        </div>

        {/* 금액 지급 섹션 */}
        {selectedUser && (
          <div className="bg-gray-900 rounded-xl p-6 border border-orange-600">
            <h2 className="text-lg font-bold mb-4 text-orange-400">💰 금액 지급</h2>
            <div className="bg-gray-800 rounded-lg p-4 mb-4">
              <p className="text-sm text-gray-400">선택된 사용자</p>
              <p className="text-white font-bold">{selectedUser.email}</p>
              <p className="text-sm text-gray-500">현재 잔액: {selectedUser.cash.toLocaleString()}원</p>
            </div>
            
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => {
                    // 숫자만 입력 허용하고 천단위 콤마 추가
                    const value = e.target.value.replace(/[^0-9-]/g, '');
                    if (value === '' || value === '-') {
                      setAmount(value);
                    } else {
                      setAmount(parseInt(value).toLocaleString());
                    }
                  }}
                  placeholder="지급할 금액 (음수 가능)"
                  className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-orange-500"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">원</span>
              </div>
              <button
                onClick={handleAddCash}
                className="px-6 py-3 bg-orange-600 hover:bg-orange-500 rounded-lg font-bold transition-colors"
              >
                지급
              </button>
              <button
                onClick={() => { setSelectedUser(null); setAmount(''); }}
                className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-bold transition-colors"
              >
                취소
              </button>
            </div>
            
            {/* 빠른 금액 버튼 */}
            <div className="flex gap-2 mt-3">
              {[100000, 1000000, 10000000, 100000000].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setAmount(preset.toLocaleString())}
                  className="flex-1 py-2 bg-gray-800 hover:bg-gray-700 rounded text-sm text-gray-300 transition-colors"
                >
                  +{preset >= 100000000 ? '1억' : preset >= 10000000 ? '1천만' : preset >= 1000000 ? '100만' : '10만'}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 사용자 목록 */}
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold">👥 등록된 사용자 ({users.length}명)</h2>
            <button
              onClick={loadUsers}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
            >
              🔄 새로고침
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p className="text-gray-500">사용자 목록 불러오는 중...</p>
            </div>
          ) : users.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              등록된 사용자가 없습니다.
            </div>
          ) : (
            <div className="space-y-2">
              {users.map((u) => (
                <div
                  key={u.uid}
                  className={`p-4 rounded-lg transition-all ${
                    selectedUser?.uid === u.uid
                      ? 'bg-orange-600/20 border border-orange-600'
                      : 'bg-gray-800 border border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div 
                      onClick={() => setSelectedUser(u)}
                      className="flex-1 cursor-pointer"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-bold text-white">{u.email}</p>
                        {u.nickname && (
                          <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                            {u.nickname}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500">
                        가입일: {formatDate(u.createdAt)} | 최근 활동: {formatDate(u.lastUpdated)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right">
                        <p className={`font-bold ${u.cash >= 10000000 ? 'text-green-400' : u.cash < 1000000 ? 'text-red-400' : 'text-white'}`}>
                          {u.cash.toLocaleString()}원
                        </p>
                        {u.totalAsset && (
                          <p className="text-xs text-gray-500">
                            총: {u.totalAsset.toLocaleString()}원
                          </p>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteUser(u);
                        }}
                        disabled={u.uid === user?.uid}
                        className="px-3 py-1.5 bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed rounded text-sm text-white transition-colors"
                        title={u.uid === user?.uid ? '자기 자신은 삭제할 수 없습니다' : '사용자 삭제'}
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 안내 */}
        <div className="bg-gray-900/50 rounded-lg p-4 text-sm text-gray-500">
          <p>💡 사용자를 클릭하여 선택한 후, 지급할 금액을 입력하세요.</p>
          <p>💡 음수 금액을 입력하면 현금을 차감할 수 있습니다.</p>
          <p>💡 삭제 버튼을 눌러 사용자를 삭제할 수 있습니다. (자기 자신은 삭제 불가)</p>
        </div>
      </main>
    </div>
  );
};

export default AdminPage;
