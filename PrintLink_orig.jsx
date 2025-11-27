import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, addDoc, onSnapshot, collection, query, serverTimestamp, setLogLevel, where } from 'firebase/firestore';
import { DollarSign, Truck, Factory, ClipboardList, Clock, Layers, Maximize, Minus, Plus, Zap, Box, Send, Briefcase, User, Eye } from 'lucide-react';

// Setting Firebase log level for debugging
// Note: This is helpful for development but can be removed in production
setLogLevel('debug');

// --- Global Constants & Configuration ---

const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'default-printlink-app';
const FIREBASE_CONFIG = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const INITIAL_AUTH_TOKEN = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

const COLLECTION_PATH_PUBLIC = (collectionName) => 
  `artifacts/${APP_ID}/public/data/${collectionName}`;

const REQUEST_FIELDS = [
    { id: 'title', label: 'Project Title', type: 'text', icon: <ClipboardList size={18} />, required: true },
    { id: 'modelInput', label: '3D Model Data (STL/CAD)', type: 'conditional_model_input', icon: <Maximize size={18} />, required: true },
    { 
        id: 'material', label: 'Required Material', type: 'select_with_other', icon: <Layers size={18} />, 
        options: ['PLA', 'ABS', 'PETG', 'Nylon', 'Resin', 'Carbon Fiber', 'Other'], required: true 
    },
    { id: 'quantity', label: 'Quantity', type: 'number', icon: <Plus size={18} />, min: 1, required: true },
    { 
        id: 'urgencyDays', label: 'Required Urgency', type: 'select', icon: <Clock size={18} />, 
        options: ['7 Days (Standard)', '5 Days', '3 Days (Rush)', 'Next Day'], required: true 
    },
    { 
        id: 'priceRange', label: 'Budget Expectation (Total)', type: 'conditional_budget_select', icon: <DollarSign size={18} />, 
        ranges: [
            { label: '$0 - $50', min: 0, max: 50 },
            { label: '$50 - $150', min: 50, max: 150 },
            { label: '$150 - $500', min: 150, max: 500 },
        ], required: true 
    },
    { 
        id: 'colors', label: 'Colors/Finish', type: 'multiselect_color_swatches', icon: <Zap size={18} />, 
        colors: ['Black', 'White', 'Gray', 'Red', 'Blue', 'Green', 'Yellow', 'Transparent'], required: true 
    },
    { 
        id: 'shippingOption', label: 'Delivery Method', type: 'conditional_select', icon: <Truck size={18} />,
        options: [
            { id: 'shipping', label: 'Ask for Shipping', value: 'Shipping' },
            { id: 'pickup', label: 'Local Pickup', value: 'Pickup', dependentField: 'pickupLocation' }
        ],
        required: true 
    },
    { 
        id: 'pickupLocation', label: 'Pickup Location', type: 'select', 
        options: ['New York City, NY', 'Austin, TX', 'San Francisco, CA', 'Other'], required: true 
    },
    { id: 'description', label: 'Detailed Description', type: 'textarea', required: false, icon: <Box size={18} /> },
];

const INITIAL_FORM_DATA = REQUEST_FIELDS.reduce((acc, field) => {
    if (field.type === 'multiselect_color_swatches') {
        acc[field.id] = [];
    } else if (field.type === 'conditional_budget_select') {
        acc[field.id] = { selectedRange: '', min: 0, max: 0 };
    } else if (field.type === 'conditional_model_input') {
        acc[field.id] = { type: 'link', value: '' };
    } else if (field.type === 'conditional_select' || field.id === 'shippingOption') {
        acc[field.id] = 'Shipping'; // Default for shipping
    } else if (field.type === 'select' || field.type === 'select_with_other') {
        acc[field.id] = field.options?.[0] || '';
    } else {
        acc[field.id] = '';
    }
    return acc;
}, {});


// --- Firebase & Auth Context Hook ---

const useFirebase = () => {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    useEffect(() => {
        if (!FIREBASE_CONFIG) {
            console.error("Firebase config is missing.");
            return;
        }

        try {
            const app = initializeApp(FIREBASE_CONFIG);
            const firestore = getFirestore(app);
            const authInstance = getAuth(app);
            
            setDb(firestore);
            setAuth(authInstance);

            const unsubscribe = onAuthStateChanged(authInstance, async (user) => {
                if (user) {
                    setUserId(user.uid);
                    setIsAuthReady(true);
                } else {
                    // Sign in anonymously if initial auth token is not present or failed
                    if (!INITIAL_AUTH_TOKEN) {
                        const anonUser = await signInAnonymously(authInstance);
                        setUserId(anonUser.user.uid);
                    }
                    setIsAuthReady(true);
                }
            });

            // Initial sign-in attempt
            const attemptSignIn = async () => {
                try {
                    if (INITIAL_AUTH_TOKEN) {
                        await signInWithCustomToken(authInstance, INITIAL_AUTH_TOKEN);
                    } else {
                        await signInAnonymously(authInstance);
                    }
                } catch (error) {
                    console.error("Auth failed, falling back to anonymous sign-in (if not already done):", error);
                    if (!authInstance.currentUser) {
                         await signInAnonymously(authInstance);
                    }
                }
            };

            // Only run the sign-in logic if an initial token exists or if we need anonymous sign-in
            if (INITIAL_AUTH_TOKEN || !authInstance.currentUser) {
                attemptSignIn();
            }

            return () => unsubscribe();
        } catch (error) {
            console.error("Failed to initialize Firebase:", error);
        }
    }, []);

    return { db, userId, isAuthReady };
};


// --- Utility Components ---

const LoadingSpinner = () => (
    <div className="flex justify-center items-center p-4">
        <svg className="animate-spin h-5 w-5 text-indigo-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <span className="ml-2 text-indigo-500">Loading...</span>
    </div>
);

const ColorSwatch = ({ color, isSelected, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className={`w-8 h-8 rounded-full border-2 transition-all duration-200
            ${isSelected ? 'ring-4 ring-offset-2 ring-indigo-500' : 'hover:ring-2 hover:ring-indigo-300'}
            ${color === 'Transparent' ? 'bg-gray-200 border-dashed border-gray-500 text-xs text-gray-700 font-bold flex items-center justify-center' : `bg-${color.toLowerCase().replace(/\s/g, '-')}-500 border-gray-300`}
        `}
        style={color === 'Transparent' ? { backgroundColor: '#f0f0f0', borderColor: '#9ca3af' } : { backgroundColor: color.toLowerCase() }}
        title={color}
    >
        {color === 'Transparent' ? 'T' : ''}
    </button>
);

const SectionCard = ({ title, children, icon }) => (
    <div className="bg-white p-6 shadow-xl rounded-xl transition-shadow hover:shadow-2xl">
        <h2 className="text-xl font-bold mb-4 text-gray-800 flex items-center border-b pb-2">
            <span className="text-indigo-500 mr-3">{icon}</span>
            {title}
        </h2>
        {children}
    </div>
);


// --- Form Field Components ---

const SelectWithOther = ({ field, value, onChange }) => (
    <>
        <select
            value={value.includes('Other:') ? 'Other' : value}
            onChange={(e) => onChange(e.target.value === 'Other' ? 'Other:' : e.target.value)}
            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
        >
            {field.options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
            ))}
        </select>
        {value.startsWith('Other:') && (
            <input
                type="text"
                value={value.replace('Other:', '').trim()}
                onChange={(e) => onChange(`Other: ${e.target.value}`)}
                placeholder="Specify other material..."
                className="mt-2 w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            />
        )}
    </>
);

const ConditionalBudgetSelect = ({ field, value, onChange }) => {
    const handleRangeChange = (e) => {
        const selectedLabel = e.target.value;
        if (selectedLabel === 'Other') {
            onChange({ selectedRange: 'Other', min: 0, max: 0 });
        } else {
            const range = field.ranges.find(r => r.label === selectedLabel);
            if (range) {
                onChange({ selectedRange: range.label, min: range.min, max: range.max });
            }
        }
    };

    const handleManualChange = (key, e) => {
        const amount = parseFloat(e.target.value) || 0;
        onChange({ ...value, [key]: amount });
    };

    const currencySymbol = Intl.NumberFormat(navigator.language, {
        style: 'currency', currency: 'USD', minimumFractionDigits: 0
    }).format(0).replace(/0/g, '').trim();

    return (
        <div className="space-y-2">
            <select
                value={value.selectedRange === 'Other' ? 'Other' : (value.selectedRange || field.ranges[0].label)}
                onChange={handleRangeChange}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            >
                {field.ranges.map(range => (
                    <option key={range.label} value={range.label}>{range.label}</option>
                ))}
                <option value="Other">Other (Specify Below)</option>
            </select>

            {value.selectedRange === 'Other' && (
                <div className="flex gap-3">
                    <div className="relative flex-1">
                        <span className="absolute left-3 top-2.5 text-gray-500">{currencySymbol}</span>
                        <input
                            type="number"
                            min="0"
                            value={value.min}
                            onChange={(e) => handleManualChange('min', e)}
                            placeholder="Min Budget"
                            className="w-full pl-8 pr-2 p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div className="relative flex-1">
                        <span className="absolute left-3 top-2.5 text-gray-500">{currencySymbol}</span>
                        <input
                            type="number"
                            min="0"
                            value={value.max}
                            onChange={(e) => handleManualChange('max', e)}
                            placeholder="Max Budget"
                            className="w-full pl-8 pr-2 p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

const MultiselectColorSwatches = ({ field, value, onChange }) => {
    const isOtherSelected = value.includes('Other');
    const customValue = isOtherSelected ? value.find(v => v.startsWith('Other:'))?.replace('Other:', '').trim() || '' : '';

    const handleSwatchClick = (color) => {
        if (color === 'Other') {
            const newColors = value.includes('Other') ? value.filter(c => !c.includes('Other')) : [...value.filter(c => !c.includes('Other')), 'Other:'];
            onChange(newColors);
        } else if (value.includes(color)) {
            onChange(value.filter(c => c !== color));
        } else {
            onChange([...value, color]);
        }
    };

    const handleCustomChange = (e) => {
        const customText = e.target.value.trim();
        const existingWithoutCustom = value.filter(c => !c.startsWith('Other:'));
        if (customText) {
            onChange([...existingWithoutCustom, `Other: ${customText}`]);
        } else {
            onChange(existingWithoutCustom.filter(c => c !== 'Other'));
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
                {field.colors.map(color => (
                    <ColorSwatch
                        key={color}
                        color={color}
                        isSelected={value.includes(color)}
                        onClick={() => handleSwatchClick(color)}
                    />
                ))}
                <button
                    type="button"
                    onClick={() => handleSwatchClick('Other')}
                    className={`px-3 py-1 text-sm font-medium rounded-full border-2 transition-all duration-200
                        ${isOtherSelected ? 'bg-indigo-500 text-white border-indigo-700' : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'}
                    `}
                >
                    Other
                </button>
            </div>
            {isOtherSelected && (
                <input
                    type="text"
                    value={customValue}
                    onChange={handleCustomChange}
                    placeholder="Specify custom color or finish..."
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                />
            )}
        </div>
    );
};

const ConditionalModelInput = ({ value, onChange }) => {
    const isLink = value.type === 'link';

    return (
        <div className="space-y-3">
            <div className="flex space-x-2 p-1 bg-gray-50 rounded-lg">
                <button
                    type="button"
                    onClick={() => onChange({ type: 'link', value: isLink ? value.value : '' })}
                    className={`flex-1 p-2 text-sm font-medium rounded-lg transition-colors duration-200 ${isLink ? 'bg-indigo-500 text-white shadow-md' : 'text-gray-700 hover:bg-white'}`}
                >
                    Model Link (URL)
                </button>
                <button
                    type="button"
                    onClick={() => onChange({ type: 'upload', value: isLink ? '' : value.value })}
                    className={`flex-1 p-2 text-sm font-medium rounded-lg transition-colors duration-200 ${!isLink ? 'bg-indigo-500 text-white shadow-md' : 'text-gray-700 hover:bg-white'}`}
                >
                    File Upload (Simulated)
                </button>
            </div>
            <input
                type={isLink ? 'url' : 'text'}
                value={value.value}
                onChange={(e) => onChange({ ...value, value: e.target.value })}
                placeholder={isLink ? "Enter model link (e.g., thingiverse.com/stl/123)" : "Simulated file path or name (e.g., 'frame_v2.stl')"}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
            />
            {!isLink && (
                <p className="text-xs text-gray-500 mt-1">
                    *Note: File upload is simulated. Please describe the file name/type here.
                </p>
            )}
        </div>
    );
};


// --- Requester Side Components ---

const PrintRequestForm = ({ db, userId, onFormSubmit }) => {
    const [formData, setFormData] = useState(INITIAL_FORM_DATA);
    const [statusMessage, setStatusMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = useCallback((id, newValue) => {
        setFormData(prev => ({ ...prev, [id]: newValue }));
    }, []);

    const validateForm = () => {
        for (const field of REQUEST_FIELDS) {
            if (field.required) {
                const value = formData[field.id];
                if (field.id === 'modelInput' && (!value.value || value.value.trim() === '')) return `Model Data (${value.type}) is required.`;
                if (field.type === 'number' && (value === 0 || value === null)) return `${field.label} cannot be zero.`;
                if (field.type === 'multiselect_color_swatches' && value.length === 0) return `${field.label} is required.`;
                if (field.id === 'priceRange' && formData.priceRange.selectedRange === 'Other' && (formData.priceRange.min <= 0 || formData.priceRange.max <= 0)) return `Please enter a valid Min/Max budget.`;
                if (field.id === 'shippingOption' && value === 'Pickup' && formData.pickupLocation === '') return `Please select a pickup location.`;
                if (typeof value === 'string' && value.trim() === '') return `${field.label} is required.`;
            }
        }
        return null;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!db || !userId) {
            setStatusMessage('Error: Authentication not ready.');
            return;
        }

        const validationError = validateForm();
        if (validationError) {
            setStatusMessage(`Validation Error: ${validationError}`);
            return;
        }

        setIsSubmitting(true);
        setStatusMessage('Submitting request...');

        try {
            const requestData = {
                ...formData,
                requesterId: userId,
                status: 'Pending', // Initial status
                timestamp: serverTimestamp(),
            };

            const docRef = await addDoc(collection(db, COLLECTION_PATH_PUBLIC('printRequests')), requestData);
            
            setStatusMessage(`Success! Request ID ${docRef.id} submitted for maker review.`);
            setFormData(INITIAL_FORM_DATA);
            onFormSubmit(docRef.id);
        } catch (error) {
            console.error("Error adding document: ", error);
            setStatusMessage(`Submission Failed: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderField = (field) => {
        const value = formData[field.id];
        // Handler for custom components that already extract the value
        const handleValueChange = (newValue) => handleChange(field.id, newValue);
        
        const commonProps = {
            id: field.id,
            value: value,
            placeholder: field.label,
        };

        switch (field.type) {
            case 'text':
            case 'url':
                return <input 
                    type={field.type} 
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" 
                    onChange={(e) => handleValueChange(e.target.value)} // FIXED: Extract value from event
                    {...commonProps} 
                />;
            case 'number':
                return <input 
                    type="number" 
                    min={field.min || 0} 
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" 
                    onChange={(e) => handleValueChange(e.target.value)} // FIXED: Extract value from event
                    {...commonProps} 
                />;
            case 'textarea':
                return <textarea 
                    rows="3" 
                    className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" 
                    onChange={(e) => handleValueChange(e.target.value)} // FIXED: Extract value from event
                    {...commonProps} 
                />;
            case 'select':
                return (
                    <select className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500" 
                        onChange={(e) => handleValueChange(e.target.value)} // FIXED: Extract value from event
                        {...commonProps}>
                        {field.options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                );
            case 'select_with_other':
                // Custom component handles its own event/value extraction
                return <SelectWithOther field={field} onChange={handleValueChange} {...commonProps} />;
            case 'conditional_budget_select':
                // Custom component handles its own event/value extraction
                return <ConditionalBudgetSelect field={field} onChange={handleValueChange} {...commonProps} />;
            case 'multiselect_color_swatches':
                // Custom component handles its own event/value extraction
                return <MultiselectColorSwatches field={field} onChange={handleValueChange} {...commonProps} />;
            case 'conditional_model_input':
                // Custom component handles its own event/value extraction
                return <ConditionalModelInput onChange={handleValueChange} {...commonProps} />;
            case 'conditional_select': {
                return (
                    <div className="space-y-2">
                        <select className="w-full p-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                            value={formData[field.id]}
                            onChange={(e) => handleChange(field.id, e.target.value)}
                        >
                            {field.options.map(opt => <option key={opt.id} value={opt.value}>{opt.label}</option>)}
                        </select>
                        {formData[field.id] === 'Pickup' && renderField(REQUEST_FIELDS.find(f => f.id === 'pickupLocation'))}
                    </div>
                );
            }
            default:
                return null;
        }
    };

    return (
        <SectionCard title="Submit New 3D Print Request" icon={<Send size={20} />}>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {REQUEST_FIELDS.filter(f => f.id !== 'pickupLocation').map(field => (
                    <div key={field.id} className={`${field.type === 'textarea' ? 'md:col-span-2' : ''}`}>
                        <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                            {field.icon}
                            <span className="ml-2">{field.label} {field.required && <span className="text-red-500">*</span>}</span>
                        </label>
                        {renderField(field)}
                    </div>
                ))}
                <div className="md:col-span-2">
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className={`w-full py-3 px-4 font-semibold rounded-xl transition-all duration-300 shadow-lg
                            ${isSubmitting ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-xl'}
                        `}
                    >
                        {isSubmitting ? 'Processing...' : 'Submit Print Request'}
                    </button>
                    {statusMessage && (
                        <p className={`mt-3 text-center text-sm font-medium ${statusMessage.startsWith('Error') ? 'text-red-600' : statusMessage.startsWith('Success') ? 'text-green-600' : 'text-gray-500'}`}>
                            {statusMessage}
                        </p>
                    )}
                </div>
            </form>
        </SectionCard>
    );
};

const RequesterRequestsList = ({ db, userId }) => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!db || !userId) return;
        setLoading(true);

        const q = query(
            collection(db, COLLECTION_PATH_PUBLIC('printRequests')),
            where('requesterId', '==', userId)
        );

        const unsubscribe = onSnapshot(q, async (querySnapshot) => {
            const fetchedRequests = [];
            for (const doc of querySnapshot.docs) {
                const requestData = { id: doc.id, ...doc.data(), offers: [] };
                
                // Fetch offers subcollection for each request
                const offersQuery = query(collection(db, `${COLLECTION_PATH_PUBLIC('printRequests')}/${doc.id}/offers`));
                const offersSnapshot = await new Promise((resolve) => {
                    const offerUnsubscribe = onSnapshot(offersQuery, (snap) => {
                        offerUnsubscribe(); // Stop listening after the first fetch for simplicity
                        resolve(snap);
                    });
                });
                
                requestData.offers = offersSnapshot.docs.map(offerDoc => ({ id: offerDoc.id, ...offerDoc.data() }));
                fetchedRequests.push(requestData);
            }
            
            // Sort by timestamp (newest first)
            fetchedRequests.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
            
            setRequests(fetchedRequests);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching requests:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, userId]);

    if (loading) return <LoadingSpinner />;

    return (
        <SectionCard title="Your Submitted Requests" icon={<Briefcase size={20} />}>
            <p className="text-sm text-gray-500 mb-4">You are authenticated as: <span className="font-mono text-xs p-1 bg-gray-100 rounded">{userId || 'N/A'}</span></p>

            {requests.length === 0 ? (
                <p className="text-center text-gray-500 p-4 border rounded-lg bg-gray-50">
                    You have no active print requests. Submit one above!
                </p>
            ) : (
                <div className="space-y-4">
                    {requests.map((req) => (
                        <div key={req.id} className="p-4 border border-indigo-200 rounded-xl shadow-md bg-white">
                            <div className="flex justify-between items-center border-b pb-2 mb-2">
                                <h3 className="text-lg font-bold text-indigo-700">{req.title}</h3>
                                <span className={`text-sm font-semibold px-3 py-1 rounded-full ${req.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'}`}>
                                    {req.status}
                                </span>
                            </div>
                            <p className="text-sm text-gray-600">
                                **Request ID:** {req.id} | **Qty:** {req.quantity} | **Material:** {req.material}
                            </p>
                            <p className="text-sm text-gray-500 mt-1">
                                **Submitted:** {req.timestamp ? new Date(req.timestamp.seconds * 1000).toLocaleDateString() : 'N/A'}
                            </p>
                            
                            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                                <h4 className="font-semibold text-gray-700 mb-2 flex items-center"><DollarSign size={16} className="mr-1"/> Maker Offers ({req.offers.length})</h4>
                                {req.offers.length === 0 ? (
                                    <p className="text-sm text-gray-500 italic">No offers received yet.</p>
                                ) : (
                                    <div className="space-y-2 max-h-40 overflow-y-auto">
                                        {req.offers.map((offer, index) => (
                                            <div key={offer.id} className="p-2 border border-green-200 rounded-lg bg-white shadow-sm">
                                                <div className="flex justify-between items-center text-sm font-medium">
                                                    <span className="text-green-700">
                                                        {Intl.NumberFormat(navigator.language, { style: 'currency', currency: 'USD' }).format(offer.price)}
                                                    </span>
                                                    <span className="text-xs text-gray-500">
                                                        Maker ID: {offer.makerId.substring(0, 8)}...
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-600 mt-1 italic break-words">"{offer.message}"</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </SectionCard>
    );
};


// --- Maker Side Components ---

const MakerOfferForm = ({ db, userId, requestId, requestTitle, onOfferMade }) => {
    const [price, setPrice] = useState('');
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [status, setStatus] = useState('');

    const handleSubmitOffer = async () => {
        if (!db || !userId || !requestId || parseFloat(price) <= 0) {
            setStatus('Error: Please enter a valid price.');
            return;
        }

        setIsSubmitting(true);
        setStatus('Submitting offer...');

        try {
            const offerData = {
                makerId: userId,
                price: parseFloat(price),
                message: message || `Offer for "${requestTitle}" - see details in request.`,
                timestamp: serverTimestamp(),
            };

            const offersCollectionPath = `${COLLECTION_PATH_PUBLIC('printRequests')}/${requestId}/offers`;
            await addDoc(collection(db, offersCollectionPath), offerData);

            setStatus(`Offer successfully submitted for ${requestTitle}!`);
            onOfferMade();
            setPrice('');
            setMessage('');
        } catch (error) {
            console.error("Error submitting offer:", error);
            setStatus(`Error: Failed to submit offer. ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="p-4 border border-green-300 bg-green-50 rounded-lg space-y-3">
            <h4 className="font-bold text-green-800">Make an Offer</h4>
            <div className="relative">
                <span className="absolute left-3 top-2.5 text-gray-500">$</span>
                <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="Your Price (USD)"
                    className="w-full pl-8 p-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
                />
            </div>
            <textarea
                rows="2"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Optional: Message (e.g., 'Can be done in 3 days using PETG.')"
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
            />
            <button
                onClick={handleSubmitOffer}
                disabled={isSubmitting || !price}
                className={`w-full py-2 font-semibold rounded-lg transition-colors duration-200
                    ${isSubmitting ? 'bg-green-300' : 'bg-green-600 text-white hover:bg-green-700'}
                `}
            >
                {isSubmitting ? 'Sending...' : 'Submit Offer'}
            </button>
            {status && <p className="text-xs text-center mt-1 text-gray-700">{status}</p>}
        </div>
    );
};

const MakerDashboard = ({ db, userId }) => {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [offersMade, setOffersMade] = useState({}); // Simple map to track local offer state

    // Force a re-render of offer forms after submission
    const handleOfferMade = useCallback((requestId) => {
        setOffersMade(prev => ({ ...prev, [requestId]: (prev[requestId] || 0) + 1 }));
    }, []);

    useEffect(() => {
        if (!db || !userId) return;
        setLoading(true);

        const q = query(collection(db, COLLECTION_PATH_PUBLIC('printRequests')), where('status', '==', 'Pending'));

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const fetchedRequests = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // Filter out requests made by the current user (you can't bid on your own job)
            const openRequests = fetchedRequests.filter(req => req.requesterId !== userId);
            
            // Sort by timestamp (oldest first, to prioritize older jobs)
            openRequests.sort((a, b) => (a.timestamp?.seconds || 0) - (b.timestamp?.seconds || 0));
            
            setRequests(openRequests);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching requests for maker:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, userId, offersMade]); // Depend on offersMade to re-trigger a fetch

    if (loading) return <LoadingSpinner />;

    return (
        <SectionCard title="Maker Dashboard: Open Requests" icon={<Factory size={20} />}>
            <p className="text-sm text-gray-500 mb-4">You are viewing as Maker: <span className="font-mono text-xs p-1 bg-gray-100 rounded">{userId || 'N/A'}</span></p>

            {requests.length === 0 ? (
                <p className="text-center text-gray-500 p-4 border rounded-lg bg-gray-50">
                    Hooray! There are no open print requests to bid on right now. Check back soon.
                </p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {requests.map((req) => (
                        <div key={req.id} className="p-5 border border-gray-200 rounded-xl shadow-lg bg-gray-50 hover:shadow-xl transition-shadow duration-300">
                            <h3 className="text-xl font-bold text-gray-800 mb-2">{req.title}</h3>
                            <div className="text-sm space-y-1 text-gray-600 mb-4">
                                <p><Layers size={14} className="inline mr-2 text-indigo-500" />**Material:** {req.material}</p>
                                <p><Plus size={14} className="inline mr-2 text-indigo-500" />**Quantity:** {req.quantity}</p>
                                <p><Clock size={14} className="inline mr-2 text-indigo-500" />**Urgency:** {req.urgencyDays}</p>
                                <p><DollarSign size={14} className="inline mr-2 text-indigo-500" />**Budget:** {req.priceRange.selectedRange === 'Other' ? `$${req.priceRange.min} - $${req.priceRange.max}` : req.priceRange.selectedRange}</p>
                                <p><Eye size={14} className="inline mr-2 text-indigo-500" />**Requester ID:** {req.requesterId.substring(0, 8)}...</p>
                            </div>
                            <p className="text-xs italic text-gray-500 mt-2 border-t pt-2">{req.description || 'No detailed description provided.'}</p>
                            
                            <div className="mt-4">
                                <MakerOfferForm 
                                    db={db} 
                                    userId={userId} 
                                    requestId={req.id} 
                                    requestTitle={req.title}
                                    onOfferMade={() => handleOfferMade(req.id)}
                                />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </SectionCard>
    );
};


// --- Main Application Component ---

const App = () => {
    const { db, userId, isAuthReady } = useFirebase();
    const [viewMode, setViewMode] = useState('requester'); // 'requester' or 'maker'
    
    // Simple state to ensure the Requester list updates after a new form submission
    const [lastRequestSubmitted, setLastRequestSubmitted] = useState(null);

    const handleViewSwitch = (mode) => {
        setViewMode(mode);
        window.scrollTo(0, 0); // Scroll to top on view change
    };

    if (!isAuthReady) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <LoadingSpinner />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 p-4 sm:p-8 font-sans">
            <div className="max-w-4xl mx-auto space-y-8">
                <header className="bg-white p-6 rounded-xl shadow-lg text-center">
                    <h1 className="text-3xl font-extrabold text-indigo-600 mb-4">
                        <span className="p-1 rounded-md bg-indigo-100 mr-2">🔗</span>
                        PrintLink Marketplace
                    </h1>
                    
                    <div className="flex justify-center space-x-4 bg-gray-50 p-2 rounded-xl">
                        <button
                            onClick={() => handleViewSwitch('requester')}
                            className={`flex items-center px-4 py-2 font-semibold rounded-lg transition-colors duration-200 ${viewMode === 'requester' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-gray-700 hover:bg-indigo-50'}`}
                        >
                            <User size={18} className="mr-2" /> I Need a Print (Requester)
                        </button>
                        <button
                            onClick={() => handleViewSwitch('maker')}
                            className={`flex items-center px-4 py-2 font-semibold rounded-lg transition-colors duration-200 ${viewMode === 'maker' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-gray-700 hover:bg-indigo-50'}`}
                        >
                            <Factory size={18} className="mr-2" /> I Make Prints (Maker)
                        </button>
                    </div>
                </header>

                {viewMode === 'requester' ? (
                    <div className="space-y-8">
                        <PrintRequestForm 
                            db={db} 
                            userId={userId} 
                            onFormSubmit={setLastRequestSubmitted}
                        />
                        <RequesterRequestsList db={db} userId={userId} key={lastRequestSubmitted} />
                    </div>
                ) : (
                    <MakerDashboard db={db} userId={userId} />
                )}
            </div>
        </div>
    );
};

export default App;