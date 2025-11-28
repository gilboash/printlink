// PrintLink.jsx
// Assumes window.__firebase_config is an object and window.firebaseHelpers is available

// Inline simple icons (as before)
const Truck = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 18H3c-1.1 0-2-.9-2-2V9h16V5c0-1.1.9-2 2-2h2"/><path d="M10 18H5"/><path d="M17 18V9"/><path d="M22 18h-2.5l-1-4h-3.46l-1 4H10"/><circle cx="16" cy="18" r="2"/><circle cx="5" cy="18" r="2"/></svg>;
const Printer = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 18H4c-1.1 0-2-.9-2-2v-5c0-1.1.9-2 2-2h16c1.1 0 2 .9 2 2v5c0 1.1-.9 2-2 2h-2"/><path d="M18 14h-4"/><path d="M14 8V3h6v5"/><path d="M14 21h-4c-1.1 0-2-.9-2-2v-5h8v5c0 1.1-.9 2-2 2z"/></svg>;
const FileText = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7l-5-5z"/><path d="M10 11h4"/><path d="M10 15h4"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>;
const User = (props) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;

// Small helper to get the firebase helpers exposed earlier
const FH = window.firebaseHelpers || null;

if (!FH) {
    console.error("firebaseHelpers not found on window. Make sure the module loader script executed before this JSX. See index.html.");
}

// --- Config and constants ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? __firebase_config : null;
const customAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

const STATUS_OPTIONS = [
    { value: 'Pending', label: 'Pending', color: 'text-yellow-600 bg-yellow-100', icon: FileText },
    { value: 'In Progress', label: 'In Progress', color: 'text-blue-600 bg-blue-100', icon: Printer },
    { value: 'Complete', label: 'Complete', color: 'text-green-600 bg-green-100', icon: Truck },
];

// --- Components ---
function AuthStatus({ userId, authReady, isAnonymous }) {
    let statusClass = 'bg-gray-200 border-gray-400 text-gray-700';
    let statusText = 'Connecting...';
    let colorClass = 'bg-gray-100';

    if (authReady) {
        if (userId) {
            statusText = isAnonymous ? 'Anonymous Session (Maker/Test Identity)' : 'Authenticated (Persistent Requester ID)';
            statusClass = isAnonymous ? 'bg-yellow-100 border-yellow-500 text-yellow-700' : 'bg-green-100 border-green-500 text-green-700';
            colorClass = isAnonymous ? 'bg-yellow-50' : 'bg-green-50';
        } else {
            statusText = 'Authentication Failed';
            statusClass = 'bg-red-100 border-red-500 text-red-700';
        }
    }

    return (
        <div className={`p-4 rounded-xl shadow-md border-l-4 ${statusClass}`}>
            <div className="flex items-center space-x-2">
                <User className="w-5 h-5" />
                <p className="font-semibold text-sm">{statusText}</p>
            </div>
            {userId && (
                <div className={`mt-2 p-2 rounded-lg ${colorClass}`}>
                    <p className="text-xs font-mono break-all user-id">
                        <span className="font-bold">User ID:</span> {userId}
                    </p>
                </div>
            )}
        </div>
    );
}

function RequestForm({ db, userId }) {
    const [title, setTitle] = React.useState('');
    const [pages, setPages] = React.useState('');
    const [isSaving, setIsSaving] = React.useState(false);

    const addDoc = FH?.addDoc;
    const collection = FH?.collection;
    const serverTimestamp = FH?.serverTimestamp;

    const getCollectionRef = () => {
        return collection(db, 'artifacts', appId, 'public', 'data', 'printlink_requests');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!title || !pages || !userId || isSaving) return;

        setIsSaving(true);
        try {
            await addDoc(getCollectionRef(), {
                requesterId: userId,
                title: title,
                pages: parseInt(pages) || 0,
                status: 'Pending',
                createdAt: serverTimestamp(),
            });
            setTitle('');
            setPages('');
        } catch (error) {
            console.error('Error submitting request:', error);
            alert("Failed to submit request: " + (error.message || error));
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 h-full">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">Submit New Print Request (Requester)</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="title" className="block text-sm font-medium text-gray-700">Document Title</label>
                    <input
                        id="title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2.5 focus:border-indigo-500 focus:ring-indigo-500"
                        placeholder="e.g., Q3 Project Report - 2 copies"
                    />
                </div>
                <div>
                    <label htmlFor="pages" className="block text-sm font-medium text-gray-700">Number of Pages</label>
                    <input
                        id="pages"
                        type="number"
                        min="1"
                        value={pages}
                        onChange={(e) => setPages(e.target.value)}
                        required
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm p-2.5 focus:border-indigo-500 focus:ring-indigo-500"
                        placeholder="e.g., 50"
                    />
                </div>
                <button
                    type="submit"
                    disabled={!title || !pages || isSaving || !userId}
                    className="w-full flex items-center justify-center px-4 py-3 border border-transparent text-sm font-medium rounded-lg shadow-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300 transition duration-150"
                >
                    {isSaving ? 'Submitting...' : 'Request Print Job'}
                </button>
            </form>
        </div>
    );
}

function RequestList({ db, userId }) {
    const [requests, setRequests] = React.useState([]);
    const [loading, setLoading] = React.useState(true);

    const collection = FH?.collection;
    const queryFn = FH?.query;
    const onSnapshot = FH?.onSnapshot;
    const docFn = FH?.doc;
    const updateDoc = FH?.updateDoc;
    const serverTimestamp = FH?.serverTimestamp;

    const getCollectionRef = React.useCallback(() => {
        return collection(db, 'artifacts', appId, 'public', 'data', 'printlink_requests');
    }, [db]);

    React.useEffect(() => {
        if (!db || !userId) return;

        setLoading(true);
        const q = queryFn(getCollectionRef());

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedRequests = snapshot.docs.map(d => {
                const data = d.data();
                let createdAtStr = 'N/A';
                if (data.createdAt && typeof data.createdAt.toDate === 'function') {
                    try {
                        createdAtStr = data.createdAt.toDate().toLocaleString();
                    } catch (e) { /* ignore */ }
                }
                return {
                    id: d.id,
                    ...data,
                    createdAt: createdAtStr
                };
            });

            fetchedRequests.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            setRequests(fetchedRequests);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching requests:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, userId, getCollectionRef]);

    const handleUpdateStatus = async (requestId, currentStatus) => {
        if (!userId) return;

        let nextStatus;
        if (currentStatus === 'Pending') nextStatus = 'In Progress';
        else if (currentStatus === 'In Progress') nextStatus = 'Complete';
        else return;

        try {
            const requestRef = docFn(db, 'artifacts', appId, 'public', 'data', 'printlink_requests', requestId);
            await updateDoc(requestRef, {
                status: nextStatus,
                makerId: userId,
                updatedAt: serverTimestamp(),
            });
        } catch (error) {
            console.error('Error updating status:', error);
            alert("Failed to update status: " + (error.message || error));
        }
    };

    return (
        <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100 h-full">
            <h2 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                <Printer className="w-6 h-6 mr-2 text-indigo-600" />
                Open Print Jobs Queue (Maker View)
            </h2>
            {loading && <p className="text-center py-4 text-gray-500">Loading requests...</p>}
            {!loading && requests.length === 0 && <p className="text-center py-4 text-gray-500">No active print requests found.</p>}

            <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                {requests.map((req) => {
                    const statusInfo = STATUS_OPTIONS.find(s => s.value === req.status) || STATUS_OPTIONS[0];
                    const StatusIcon = statusInfo.icon;

                    const isActionable = req.status === 'Pending' || req.status === 'In Progress';
                    let buttonText = '';
                    if (req.status === 'Pending') buttonText = 'Start Printing';
                    if (req.status === 'In Progress') buttonText = 'Mark as Complete';

                    return (
                        <div key={req.id} className={`p-4 border rounded-xl shadow-sm transition duration-100 
                            ${req.status === 'Complete' ? 'bg-green-50 border-green-200 opacity-80' : 'bg-gray-50 border-gray-200 hover:shadow-md'}`}>
                            
                            <div className="flex justify-between items-start">
                                <h3 className={`font-semibold text-lg ${req.status === 'Complete' ? 'text-gray-600 line-through' : 'text-gray-800'}`}>{req.title}</h3>
                                <span className={`flex items-center text-xs font-medium px-2.5 py-0.5 rounded-full ${statusInfo.color}`}>
                                    <StatusIcon className="w-3 h-3 mr-1" />
                                    {req.status}
                                </span>
                            </div>
                            
                            <div className="text-sm text-gray-500 mt-1 space-y-0.5">
                                <p>Pages: <span className="font-medium text-gray-700">{req.pages}</span></p>
                                <p className="text-xs">Requested by: <span className="font-mono text-gray-600 break-all">{(req.requesterId || '').substring(0, 8)}...</span></p>
                                {req.makerId && <p className="text-xs">Handled by: <span className="font-mono text-gray-600 break-all">{(req.makerId || '').substring(0, 8)}...</span></p>}
                                <p className="text-xs text-gray-400">Created: {req.createdAt}</p>
                            </div>
                            
                            {isActionable && (
                                <button
                                    onClick={() => handleUpdateStatus(req.id, req.status)}
                                    className="mt-3 w-full px-3 py-2 text-sm font-semibold rounded-lg text-white bg-indigo-500 hover:bg-indigo-600 transition duration-150 shadow-md"
                                >
                                    {buttonText}
                                </button>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function App() {
    const [db, setDb] = React.useState(null);
    const [userId, setUserId] = React.useState(null);
    const [isAuthReady, setIsAuthReady] = React.useState(false);
    const [isAnonymous, setIsAnonymous] = React.useState(false);

    React.useEffect(() => {
        if (!firebaseConfig || Object.keys(firebaseConfig).length === 0) {
            console.error("Firebase configuration is missing or invalid. Make sure window.__firebase_config is set in index.html.");
            return;
        }
        if (!FH) {
            console.error("Firebase helpers not available on window (window.firebaseHelpers).");
            return;
        }

        const { initializeApp, getFirestore, getAuth, setPersistence, browserSessionPersistence, signInWithCustomToken, signInAnonymously, onAuthStateChanged } = FH;

        const appInstance = initializeApp(firebaseConfig);
        const firestore = getFirestore(appInstance);
        const authInstance = getAuth(appInstance);

        setDb(firestore);

        // set persistence and sign-in
        setPersistence(authInstance, browserSessionPersistence)
            .then(async () => {
                try {
                    if (customAuthToken) {
                        await signInWithCustomToken(authInstance, customAuthToken);
                    } else {
                        await signInAnonymously(authInstance);
                    }
                } catch (err) {
                    console.error("Sign-in failed:", err);
                }
            })
            .catch(error => {
                console.error("Auth persistence failed:", error);
            });

        const unsubscribe = onAuthStateChanged(authInstance, (user) => {
            if (user) {
                setUserId(user.uid);
                setIsAnonymous(user.isAnonymous);
            } else {
                setUserId(null);
            }
            setIsAuthReady(true);
        });

        return () => unsubscribe();
    }, []);

    if (!isAuthReady) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="text-xl font-semibold text-gray-600">Loading Application...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 p-4 sm:p-8 font-[Inter]">
            <div className="max-w-5xl mx-auto space-y-8">
                <header className="text-center py-4 bg-white rounded-xl shadow-lg">
                    <h1 className="text-4xl font-extrabold text-gray-900 mb-2">
                        <span className="text-indigo-600">Print</span>Link Job Queue
                    </h1>
                    <p className="text-md text-gray-500">Simple real-time queue for Requesters and Makers.</p>
                </header>

                <AuthStatus userId={userId} authReady={isAuthReady} isAnonymous={isAnonymous} />
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <RequestForm db={db} userId={userId} />
                    <RequestList db={db} userId={userId} />
                </div>

                <footer className="text-center pt-8 text-xs text-gray-400">
                    <p>App ID: {appId}</p>
                </footer>
            </div>
        </div>
    );
}

// mount (React 18 safe)
const rootElement = document.getElementById('root');
if (ReactDOM.createRoot) {
    ReactDOM.createRoot(rootElement).render(<App />);
} else {
    ReactDOM.render(<App />, rootElement);
}
