import { create } from 'zustand';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { doc, setDoc, getDoc, updateDoc, serverTimestamp, collection, getDocs, onSnapshot, deleteDoc, query, where } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

// 관리자 이메일 목록
const ADMIN_EMAILS = ['bluesangh@gmail.com'];

// 주가 데이터 타입
export interface StockPriceData {
  [stockId: string]: {
    currentPrice: number;
    previousClose: number;
    openPrice: number;
    upperLimit: number;
    lowerLimit: number;
    // 거래정지 관련
    tradingHalted?: boolean;
    haltedUntilTick?: number | null;
    haltedAtTick?: number | null;
    haltReason?: 'upper' | 'lower' | null;
    // 상장폐지 관련
    isDelisted?: boolean;
    delistedAtDay?: number | null;
    delistingWarning?: boolean;
  };
}

// Firebase에서 받아오는 전체 주가 문서 타입
export interface StockPriceDocument {
  prices: StockPriceData;
  gameTick?: number;
  currentDay?: number;
  isNewsPhase?: boolean;
  newsPhaseCountdown?: number;
  newsWarningActive?: boolean;
  isMarketClosed?: boolean;
  marketClosingMessage?: string | null;
  dayProgress?: number;
}

// 뉴스 이벤트 타입
export interface NewsEventData {
  id: string;
  time: number;
  day: number;
  title: string;
  description: string;
  effect: 'GOOD' | 'BAD';
  targetStockId: string;
  jumpPercent: number;
}

// 사용자 정보 타입
export interface UserInfo {
  uid: string;
  email: string;
  cash: number;
  nickname?: string;
  nicknameLastChanged?: Date | null;
  totalAsset?: number;
  createdAt: Date | null;
  lastUpdated: Date | null;
}

export interface UserGameData {
  cash: number;
  cashGranted?: number; // 관리자 지급 금액 (별도 추적)
  portfolio: { stockId: string; quantity: number; averagePrice: number }[];
  gameTick: number;
  currentDay?: number; // 현재 게임 일수
  lastUpdated: Date | null;
  nickname?: string;
  nicknameLastChanged?: Date | null;
  totalAsset?: number; // 총잔고 (현금 + 주식 평가액)
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  isInitialized: boolean;
  
  // Actions
  initialize: () => void;
  signUp: (email: string, password: string) => Promise<boolean>;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
  
  // Firestore
  saveGameData: (data: UserGameData) => Promise<void>;
  loadGameData: () => Promise<UserGameData | null>;
  startRealtimeSync: (onDataChange: (data: UserGameData) => void) => () => void; // 실시간 동기화 시작, cleanup 함수 반환
  updateNickname: (nickname: string) => Promise<boolean>;
  canChangeNickname: () => Promise<boolean>;
  
  // Admin functions
  isAdmin: () => boolean;
  getAllUsers: () => Promise<UserInfo[]>;
  getAllUsersForRanking: () => Promise<UserInfo[]>; // 일반 사용자용 랭킹 조회
  addCashToUser: (uid: string, amount: number) => Promise<boolean>;
  deleteUser: (uid: string) => Promise<boolean>;
  
  // Stock price sync functions
  saveStockPrices: (prices: StockPriceData) => Promise<void>;
  loadStockPrices: () => Promise<StockPriceDocument | null>;
  subscribeToStockPrices: (callback: (data: StockPriceDocument) => void) => () => void;
  subscribeToNewsEvents: (callback: (events: NewsEventData[]) => void) => () => void;
  
  // 홀짝 게임
  subscribeToOddEvenGame: (callback: (data: any) => void) => () => void;
  
  // Server status
  getServerStatus: () => Promise<{ isRunning: boolean } | null>;
  subscribeToServerStatus: (callback: (status: { isRunning: boolean }) => void) => () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isLoading: true,
  error: null,
  isInitialized: false,

  initialize: () => {
    // 자동 로그인: Firebase Auth 상태 변화 감지
    onAuthStateChanged(auth, (user) => {
      set({ user, isLoading: false, isInitialized: true });
    });
  },

  signUp: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // 새 사용자의 초기 게임 데이터 생성
      await setDoc(doc(db, 'users', userCredential.user.uid), {
        email: email,
        cash: 10000000, // 1천만원
        portfolio: [],
        gameTick: 0,
        currentDay: 1,
        nickname: null,
        nicknameLastChanged: null,
        totalAsset: 10000000,
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp()
      });
      
      set({ user: userCredential.user, isLoading: false });
      return true;
    } catch (error: any) {
      let errorMessage = '회원가입에 실패했습니다.';
      if (error.code === 'auth/email-already-in-use') {
        errorMessage = '이미 사용 중인 이메일입니다.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = '비밀번호는 6자 이상이어야 합니다.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = '유효하지 않은 이메일 형식입니다.';
      }
      set({ error: errorMessage, isLoading: false });
      return false;
    }
  },

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      set({ user: userCredential.user, isLoading: false });
      return true;
    } catch (error: any) {
      let errorMessage = '로그인에 실패했습니다.';
      if (error.code === 'auth/user-not-found') {
        errorMessage = '등록되지 않은 이메일입니다.';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = '비밀번호가 올바르지 않습니다.';
      } else if (error.code === 'auth/invalid-credential') {
        errorMessage = '이메일 또는 비밀번호가 올바르지 않습니다.';
      }
      set({ error: errorMessage, isLoading: false });
      return false;
    }
  },

  logout: async () => {
    try {
      await signOut(auth);
      set({ user: null });
    } catch (error) {
      console.error('Logout error:', error);
    }
  },

  clearError: () => set({ error: null }),

  saveGameData: async (data: UserGameData) => {
    const { user } = get();
    if (!user) return;
    
    try {
      // 델타 업데이트: 변경된 필드만 업데이트
      const updateData: any = {
        lastUpdated: serverTimestamp()
      };
      
      // cash를 저장할 때 cashGranted를 빼서 baseCash만 저장
      // 이렇게 해야 관리자 지급 금액이 덮어쓰여지지 않음
      if (data.cash !== undefined) {
        const cashGranted = data.cashGranted || 0;
        updateData.cash = data.cash - cashGranted; // baseCash만 저장
      }
      if (data.portfolio !== undefined) updateData.portfolio = data.portfolio;
      if (data.gameTick !== undefined) updateData.gameTick = data.gameTick;
      if (data.currentDay !== undefined) updateData.currentDay = data.currentDay;
      if (data.totalAsset !== undefined) updateData.totalAsset = data.totalAsset;
      
      await updateDoc(doc(db, 'users', user.uid), updateData);
      console.log('[Firebase] Game data saved:', { 
        gameTick: data.gameTick, 
        currentDay: data.currentDay,
        baseCash: updateData.cash,
        cashGranted: data.cashGranted
      });
    } catch (error) {
      console.error('Error saving game data:', error);
    }
  },

  loadGameData: async () => {
    const { user } = get();
    if (!user) return null;
    
    try {
      const docSnap = await getDoc(doc(db, 'users', user.uid));
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        // 닉네임은 있는 그대로 반환 (null, undefined, 또는 실제 값)
        const nickname = data.nickname !== undefined && data.nickname !== null && data.nickname !== '' 
          ? data.nickname 
          : null;
        
        // 관리자 지급 금액 포함
        const baseCash = data.cash || 0;
        const cashGranted = data.cashGranted || 0;
        const totalCash = baseCash + cashGranted;
        
        console.log('[Firebase] Loaded game data:', { 
          gameTick: data.gameTick, 
          currentDay: data.currentDay,
          nickname: nickname,
          rawNickname: data.nickname,
          baseCash: baseCash,
          cashGranted: cashGranted,
          totalCash: totalCash
        });
        
        return {
          cash: totalCash,
          cashGranted: cashGranted, // 별도로 추적
          portfolio: data.portfolio || [],
          gameTick: data.gameTick || 0,
          currentDay: data.currentDay || 1,
          nickname: nickname,
          nicknameLastChanged: data.nicknameLastChanged?.toDate() || null,
          totalAsset: data.totalAsset || totalCash || 0,
          lastUpdated: data.lastUpdated?.toDate() || null
        };
      }
      return null;
    } catch (error) {
      console.error('Error loading game data:', error);
      return null;
    }
  },

  // 실시간 동기화 시작 (오프라인 퍼시스턴스)
  startRealtimeSync: (onDataChange: (data: UserGameData) => void) => {
    const { user } = get();
    if (!user) return () => {}; // cleanup 함수 반환
    
    let unsubscribe: (() => void) | null = null;
    
    // Firestore 실시간 리스너 설정 (오프라인 퍼시스턴스 지원)
    const userRef = doc(db, 'users', user.uid);
    unsubscribe = onSnapshot(
      userRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const gameData: UserGameData = {
            cash: data.cash,
            portfolio: data.portfolio || [],
            gameTick: data.gameTick || 0,
            currentDay: data.currentDay || 1,
            nickname: data.nickname || null,
            nicknameLastChanged: data.nicknameLastChanged?.toDate() || null,
            totalAsset: data.totalAsset || data.cash || 0,
            lastUpdated: data.lastUpdated?.toDate() || null
          };
          console.log('[Firebase] Realtime update received:', { gameTick: data.gameTick, currentDay: data.currentDay });
          onDataChange(gameData);
        }
      },
      (error) => {
        console.error('Realtime sync error:', error);
      }
    );
    
    // Cleanup 함수
    return () => {
      if (unsubscribe) unsubscribe();
    };
  },

  // 닉네임 변경 가능 여부 확인 (210분 = 12,600초 = 12,600틱)
  canChangeNickname: async () => {
    const { user } = get();
    if (!user) return false;
    
    try {
      const docSnap = await getDoc(doc(db, 'users', user.uid));
      if (!docSnap.exists()) return true; // 신규 사용자는 변경 가능
      
      const data = docSnap.data();
      const lastChanged = data.nicknameLastChanged?.toDate();
      
      if (!lastChanged) return true; // 한 번도 변경하지 않았으면 가능
      
      // 210분(12,600초) 경과 확인
      const now = new Date();
      const diffMinutes = (now.getTime() - lastChanged.getTime()) / (1000 * 60);
      return diffMinutes >= 210;
    } catch (error) {
      console.error('Error checking nickname change:', error);
      return false;
    }
  },

  // 닉네임 업데이트
  updateNickname: async (nickname: string) => {
    const { user, canChangeNickname } = get();
    if (!user) return false;
    
    if (!nickname || nickname.trim().length === 0) return false;
    if (nickname.trim().length > 20) return false; // 최대 20자
    
    const trimmedNickname = nickname.trim();
    
    // 닉네임 중복 체크
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('nickname', '==', trimmedNickname));
      const querySnapshot = await getDocs(q);
      
      // 현재 사용자가 아닌 다른 사용자가 같은 닉네임을 사용 중인지 확인
      const isDuplicate = querySnapshot.docs.some(doc => doc.id !== user.uid);
      if (isDuplicate) {
        return false; // 중복됨
      }
    } catch (error) {
      console.error('Error checking nickname duplicate:', error);
      return false;
    }
    
    const canChange = await canChangeNickname();
    if (!canChange) return false;
    
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        nickname: trimmedNickname,
        nicknameLastChanged: serverTimestamp()
      });
      return true;
    } catch (error) {
      console.error('Error updating nickname:', error);
      return false;
    }
  },

  // 관리자 확인
  isAdmin: () => {
    const { user } = get();
    if (!user || !user.email) return false;
    return ADMIN_EMAILS.includes(user.email);
  },

  // 모든 사용자 목록 가져오기 (관리자 전용)
  getAllUsers: async () => {
    const { isAdmin } = get();
    if (!isAdmin()) return [];
    
    try {
      const usersCollection = collection(db, 'users');
      const snapshot = await getDocs(usersCollection);
      const users: UserInfo[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        users.push({
          uid: doc.id,
          email: data.email || 'Unknown',
          cash: data.cash || 0,
          nickname: data.nickname || null,
          nicknameLastChanged: data.nicknameLastChanged?.toDate() || null,
          totalAsset: data.totalAsset || data.cash || 0,
          createdAt: data.createdAt?.toDate() || null,
          lastUpdated: data.lastUpdated?.toDate() || null,
        });
      });
      
      return users;
    } catch (error) {
      console.error('Error fetching users:', error);
      return [];
    }
  },

  // 특정 사용자에게 현금 추가 (관리자 전용)
  addCashToUser: async (uid: string, amount: number) => {
    const { isAdmin } = get();
    if (!isAdmin()) return false;
    
    try {
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) return false;
      
      // cashGranted 필드에 누적 (saveGameData에서 덮어쓰지 않음)
      const currentGranted = userSnap.data().cashGranted || 0;
      await updateDoc(userRef, {
        cashGranted: currentGranted + amount,
        lastUpdated: serverTimestamp()
      });
      
      console.log(`[Admin] Cash granted to ${uid}: ${amount} (total granted: ${currentGranted + amount})`);
      return true;
    } catch (error) {
      console.error('Error adding cash to user:', error);
      return false;
    }
  },

  // 사용자 삭제 (관리자 전용)
  deleteUser: async (uid: string) => {
    const { isAdmin } = get();
    if (!isAdmin()) return false;
    
    try {
      await deleteDoc(doc(db, 'users', uid));
      return true;
    } catch (error) {
      console.error('Error deleting user:', error);
      return false;
    }
  },

  // 일반 사용자용 랭킹 조회 (제한된 정보만)
  getAllUsersForRanking: async () => {
    try {
      const usersCollection = collection(db, 'users');
      const snapshot = await getDocs(usersCollection);
      const users: UserInfo[] = [];
      
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        users.push({
          uid: docSnap.id,
          email: data.email || 'Unknown',
          cash: data.cash || 0,
          nickname: data.nickname || null,
          nicknameLastChanged: data.nicknameLastChanged?.toDate() || null,
          totalAsset: data.totalAsset || data.cash || 0,
          createdAt: data.createdAt?.toDate() || null,
          lastUpdated: data.lastUpdated?.toDate() || null,
        });
      });
      
      return users;
    } catch (error) {
      console.error('Error fetching users for ranking:', error);
      return [];
    }
  },

  // 주가 데이터 저장 (Admin 전용)
  saveStockPrices: async (prices: StockPriceData) => {
    const { isAdmin } = get();
    if (!isAdmin()) return;
    
    try {
      await setDoc(doc(db, 'game', 'stockPrices'), {
        prices,
        lastUpdated: serverTimestamp()
      });
      console.log('[Firebase] Stock prices saved');
    } catch (error) {
      console.error('Error saving stock prices:', error);
    }
  },

  // 주가 데이터 로드
  loadStockPrices: async () => {
    try {
      const docSnap = await getDoc(doc(db, 'game', 'stockPrices'));
      if (docSnap.exists()) {
        const data = docSnap.data();
        console.log('[Firebase] Stock prices loaded');
        return {
          prices: data.prices as StockPriceData,
          gameTick: data.gameTick,
          currentDay: data.currentDay
        };
      }
      return null;
    } catch (error) {
      console.error('Error loading stock prices:', error);
      return null;
    }
  },

  // 주가 데이터 실시간 구독
  subscribeToStockPrices: (callback: (data: StockPriceDocument) => void) => {
    const stockPricesRef = doc(db, 'game', 'stockPrices');
    const unsubscribe = onSnapshot(
      stockPricesRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          console.log('[Firebase] Stock prices update received', { 
            gameTick: data.gameTick, 
            currentDay: data.currentDay,
            dayProgress: data.dayProgress,
            isMarketClosed: data.isMarketClosed
          });
          callback({
            prices: data.prices as StockPriceData,
            gameTick: data.gameTick,
            currentDay: data.currentDay,
            dayProgress: data.dayProgress,
            isNewsPhase: data.isNewsPhase,
            newsPhaseCountdown: data.newsPhaseCountdown,
            newsWarningActive: data.newsWarningActive,
            isMarketClosed: data.isMarketClosed,
            marketClosingMessage: data.marketClosingMessage || null
          });
        }
      },
      (error) => {
        console.error('Stock prices sync error:', error);
      }
    );
    
    return unsubscribe;
  },

  // 뉴스 이벤트 실시간 구독
  subscribeToNewsEvents: (callback: (events: NewsEventData[]) => void) => {
    const newsEventsRef = doc(db, 'game', 'newsEvents');
    const unsubscribe = onSnapshot(
      newsEventsRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          console.log('[Firebase] News events received', { count: data.events?.length || 0 });
          callback(data.events || []);
        }
      },
      (error) => {
        console.error('News events sync error:', error);
      }
    );
    
    return unsubscribe;
  },

  // 홀짝 게임 실시간 구독
  subscribeToOddEvenGame: (callback: (data: any) => void) => {
    const oddEvenRef = doc(db, 'game', 'oddEven');
    const unsubscribe = onSnapshot(
      oddEvenRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          console.log('[Firebase] OddEven game state received', { phase: data.phase, roundId: data.roundId });
          callback({
            roundId: data.roundId,
            phase: data.phase,
            bettingEndTime: data.bettingEndTime,
            result: data.result,
            nextRoundTime: data.nextRoundTime,
            totalOddBets: data.totalOddBets || 0,
            totalEvenBets: data.totalEvenBets || 0
          });
        }
      },
      (error) => {
        console.error('OddEven game sync error:', error);
      }
    );
    
    return unsubscribe;
  },

  // 서버 상태 가져오기
  getServerStatus: async () => {
    try {
      const docSnap = await getDoc(doc(db, 'game', 'serverStatus'));
      if (docSnap.exists()) {
        const data = docSnap.data();
        return { isRunning: data.isRunning || false };
      }
      return { isRunning: false };
    } catch (error) {
      console.error('Error getting server status:', error);
      return null;
    }
  },

  // 서버 상태 실시간 구독
  subscribeToServerStatus: (callback: (status: { isRunning: boolean }) => void) => {
    const serverStatusRef = doc(db, 'game', 'serverStatus');
    const unsubscribe = onSnapshot(
      serverStatusRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          callback({ isRunning: data.isRunning || false });
        } else {
          callback({ isRunning: false });
        }
      },
      (error) => {
        console.error('Server status sync error:', error);
      }
    );
    
    return unsubscribe;
  }
}));
