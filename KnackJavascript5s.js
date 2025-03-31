import React, { useState, useEffect, useCallback, useRef } from "react";
console.log("[App.js] >>> Component function started");
import "./App.css";
import FlashcardList from "./components/FlashcardList";
import CardCreator from "./components/CardCreator";
import SpacedRepetition from "./components/SpacedRepetition";
import LoadingSpinner from "./components/LoadingSpinner";
import Header from "./components/Header";
import AICardGenerator from './components/AICardGenerator';
import PrintModal from './components/PrintModal';
import TopicListSyncManager from './components/TopicListSyncManager';
import { 
  initializeAuthManager, 
  handleTokenRefreshRequest, 
} from './utils/AuthAppIntegration';
import { 
  addVersionMetadata, 
  safeParseJSON, 
  localStorageHelpers, 
  dataLogger,
  backupMultipleChoiceOptions,
  restoreMultipleChoiceOptions
} from './utils/DataUtils';

import {
  validateCards,
} from './utils/CardDataProcessor';

// API Keys and constants

// Box descriptions

// Helper function to clean HTML tags from strings
const cleanHtmlTags = (str) => {
  if (!str) return "";
  // If it's not a string, convert to string
  const strValue = String(str);
  // Remove HTML tags
  return strValue.replace(/<\/?[^>]+(>|$)/g, "").trim();
};

function App() {
  console.log("[App.js] >>> Component function started");
  // Authentication and user state
  const [auth, setAuth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState("Initializing...");
  const [error] = useState(null);
  const [recordId, setRecordId] = useState(null);

  // App view state
  const [view, setView] = useState("cardBank"); // cardBank, createCard, spacedRepetition

  // Flashcard data
  const [allCards, setAllCards] = useState([]);
  const [subjectColorMapping, setSubjectColorMapping] = useState({});
  const [currentSubjectColor, setCurrentSubjectColor] = useState("#e6194b");

  // Filters and selections
  const [selectedSubject, setSelectedSubject] = useState(null);
  const [selectedTopic, setSelectedTopic] = useState(null);

  // Topic List Modal state
  const [topicListModalOpen, setTopicListModalOpen] = useState(false);
  const [topicListSubject] = useState(null);
  const [topicListExamBoard] = useState("AQA");
  const [topicListExamType] = useState("A-Level");

  // Spaced repetition state
  const [currentBox, setCurrentBox] = useState(1);
  const [spacedRepetitionData, setSpacedRepetitionData] = useState({
    box1: [],
    box2: [],
    box3: [],
    box4: [],
    box5: [],
  });

  // User-specific topics
  const [userTopics, setUserTopics] = useState({});
  
  // Topic lists state
  const [topicLists, setTopicLists] = useState([]);
  const [topicMetadata, setTopicMetadata] = useState([]);

  // Status messages
  const [statusMessage, setStatusMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // PrintModal state
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [cardsToPrint] = useState([]);
  const [printTitle] = useState("");
  const [cardCreationModalOpen, setCardCreationModalOpen] = useState(false);

  // Restore authProcessedRef 
  const authProcessedRef = useRef(false);

  // User information - enhanced with additional student data
  const getUserInfo = useCallback(() => {
    return {
      id: auth?.id || "",
      email: auth?.email || "",
      name: auth?.name || "",
      role: auth?.role || "",  // Add user role
      tutorGroup: auth?.tutorGroup || "",
      yearGroup: auth?.yearGroup || "",
      tutor: auth?.tutor || "",
      school: auth?.school || auth?.field_122 || "" // School/Educational Establishment
    };
  }, [auth]);

  // Define helper functions first, without dependencies on other functions
  const showStatus = useCallback((message, duration = 3000) => {
    setStatusMessage(message);
    setTimeout(() => setStatusMessage(""), duration);
  }, []);

  // Update spaced repetition data
  const updateSpacedRepetitionData = useCallback((cards) => {
    const newSpacedRepetitionData = {
      box1: [],
      box2: [],
      box3: [],
      box4: [],
      box5: [],
    };

    cards.forEach((card) => {
      const boxNum = card.boxNum || 1;
      if (boxNum >= 1 && boxNum <= 5) {
        // Store card ID with review date information
        newSpacedRepetitionData[`box${boxNum}`].push({
          cardId: card.id,
          lastReviewed: card.lastReviewed || new Date().toISOString(),
          nextReviewDate: card.nextReviewDate || new Date().toISOString() // Default to today's date if not present
        });
      }
    });

    setSpacedRepetitionData(newSpacedRepetitionData);
  }, []);

  // Extract unique topics for a selected subject
  const getTopicsForSubject = useCallback(
    (subject) => {
      if (!subject) return [];
      const topics = [
        ...new Set(
          allCards
            .filter((card) => (card.subject || "General") === subject)
            .map((card) => card.topic || "General")
        ),
      ];
      return topics.sort();
    },
    [allCards]
  );

  // Generate a shade of a base color
  const generateShade = useCallback((baseColor, shadeIndex, totalShades) => {
    // Convert hex to RGB
    const r = parseInt(baseColor.slice(1, 3), 16);
    const g = parseInt(baseColor.slice(3, 5), 16);
    const b = parseInt(baseColor.slice(5, 7), 16);
    
    // Calculate lightness adjustment based on shade index
    // Using a range from -20% (darker) to +30% (lighter)
    const adjustment = -20 + (50 * (shadeIndex / (totalShades - 1)));
    
    // Apply adjustment to RGB values
    let adjustedR = Math.min(255, Math.max(0, r * (1 + adjustment/100)));
    let adjustedG = Math.min(255, Math.max(0, g * (1 + adjustment/100)));
    let adjustedB = Math.min(255, Math.max(0, b * (1 + adjustment/100)));
    
    // Convert back to hex
    const adjustedHex = '#' + 
      Math.round(adjustedR).toString(16).padStart(2, '0') +
      Math.round(adjustedG).toString(16).padStart(2, '0') +
      Math.round(adjustedB).toString(16).padStart(2, '0');
    
    return adjustedHex;
  }, []);

  // Save data to localStorage fallback - using enhanced version with versioning and backups
  const saveToLocalStorage = useCallback(() => {
    // Prepare full data object
    const appData = {
      cards: allCards,
      colorMapping: subjectColorMapping,
      spacedRepetition: spacedRepetitionData,
      userTopics: userTopics,
      topicLists: topicLists,
      topicMetadata: topicMetadata
    };
    
    try {
      // Add version metadata
      const versionedData = addVersionMetadata(appData);
      
      // Log save operation with stats
      dataLogger.logSave('localStorage', versionedData);
      
      // Save with backup using enhanced helpers
      localStorageHelpers.saveData('flashcards_app', versionedData);
      
      // Also save individual components for backward compatibility
      localStorage.setItem('flashcards', JSON.stringify(allCards));
      localStorage.setItem('colorMapping', JSON.stringify(subjectColorMapping));
      localStorage.setItem('spacedRepetition', JSON.stringify(spacedRepetitionData));
      localStorage.setItem('userTopics', JSON.stringify(userTopics));
      
      // Backup multiple choice options
      backupMultipleChoiceOptions(allCards);
      
      console.log("Saved data to localStorage with versioning and backup");
    } catch (error) {
      console.error("Error saving to localStorage:", error);
      dataLogger.logError('localStorage_save', error);
    }
  }, [allCards, subjectColorMapping, spacedRepetitionData, userTopics, topicLists, topicMetadata]);

  // Add this function to recover the record ID if it gets lost
  const ensureRecordId = useCallback(async () => {
    // If we already have a record ID, nothing to do
    if (recordId) {
      return recordId;
    }
    
    console.log("[Auth Recovery] Record ID missing, attempting to recover...");
    
    // First try to get it from auth object
    if (auth && auth.recordId) {
      console.log("[Auth Recovery] Found record ID in auth object:", auth.recordId);
      return auth.recordId;
    }
    
    // Try to recover from localStorage as a backup
    try {
      const storedData = localStorage.getItem('flashcards_auth');
      if (storedData) {
        const parsedData = JSON.parse(storedData);
        if (parsedData && parsedData.recordId) {
          console.log("[Auth Recovery] Recovered record ID from localStorage:", parsedData.recordId);
          return parsedData.recordId;
        }
      }
    } catch (e) {
      console.error("[Auth Recovery] Error reading from localStorage:", e);
    }
    
    // If we're in an iframe, request it from the parent
    if (window.parent !== window) {
      console.log("[Auth Recovery] Requesting record ID from parent window");
      
      // Create a promise that will resolve when we get a response
      return new Promise((resolve) => {
        // Function to handle the response
        const handleRecordIdResponse = (event) => {
          if (event.data && event.data.type === 'RECORD_ID_RESPONSE' && event.data.recordId) {
            console.log("[Auth Recovery] Received record ID from parent:", event.data.recordId);
            
            // Store the record ID in localStorage for future recovery
            try {
              const authData = { recordId: event.data.recordId };
              localStorage.setItem('flashcards_auth', JSON.stringify(authData));
            } catch (e) {
              console.error("[Auth Recovery] Error storing record ID in localStorage:", e);
            }
            
            // Remove the event listener
            window.removeEventListener('message', handleRecordIdResponse);
            
            // Resolve with the record ID
            resolve(event.data.recordId);
          }
        };
        
        // Add event listener
        window.addEventListener('message', handleRecordIdResponse);
        
        // Send request to parent
        window.parent.postMessage({
          type: 'REQUEST_RECORD_ID',
          timestamp: new Date().toISOString()
        }, '*');
        
        // Set a timeout to avoid hanging indefinitely
        setTimeout(() => {
          window.removeEventListener('message', handleRecordIdResponse);
          console.error("[Auth Recovery] Timed out waiting for record ID");
          resolve(null);
        }, 5000);
      });
    }
    
    // If all recovery methods fail
    console.error("[Auth Recovery] Could not recover record ID");
    return null;
  }, [recordId, auth]);

  // Modify the saveData function to use the ensureRecordId function
  const saveData = useCallback(async () => {
    // Check if we're authenticated
    if (!auth) {
      console.log("[Save] No authentication available, saving locally only");
      saveToLocalStorage();
      setIsSaving(false);
      return;
    }

    // Prevent multiple save operations
    if (isSaving) {
      console.log("[Save] Save already in progress, skipping this request");
      showStatus("Save in progress...");
      return;
    }

    console.log("[Save] Starting save operation...");
    setIsSaving(true);
    
    // Always save to localStorage first as a backup
    console.log("[Save] Saving to localStorage first");
    saveToLocalStorage();
    
    // If we're in an iframe, send data to parent window
    if (window.parent !== window) {
      console.log("[Save] Preparing data for Knack integration");
      
      // Get recordId safely - use the new ensureRecordId function
      let safeRecordId = recordId;
      if (!safeRecordId) {
        safeRecordId = await ensureRecordId();
      }
      
      if (!safeRecordId) {
        console.error("[Save] No record ID available, cannot save to Knack");
        setIsSaving(false);
        showStatus("Error: Missing record ID for save");
        return;
      }
      
      // Ensure data is serializable by running it through JSON.stringify + JSON.parse
      // This prevents circular references and other serialization issues
      const safeSerializeData = (data) => {
        try {
          return JSON.parse(JSON.stringify(data));
        } catch (e) {
          console.error("[Save] Serialization error:", e);
          // Try to clean the data manually
          return {
            ...data,
            _cleaned: true
          };
        }
      };
      
      // Prepare the data payload for Knack
      const safeData = {
        recordId: safeRecordId,
        cards: safeSerializeData(allCards),
        colorMapping: safeSerializeData(subjectColorMapping), 
        spacedRepetition: safeSerializeData(spacedRepetitionData),
        userTopics: safeSerializeData(userTopics),
        topicLists: safeSerializeData(topicLists),
        topicMetadata: safeSerializeData(topicMetadata),
        preserveFields: true
      };
      
      console.log(`[Save] Sending data to Knack (${allCards.length} cards, record ID: ${safeRecordId})`);
      
      // Add a timeout to clear the saving state if no response is received
      const saveTimeout = setTimeout(() => {
        console.log("[Save] No save response received within timeout, resetting save state");
        setIsSaving(false);
        showStatus("Save status unknown - check your data");
      }, 15000); // 15 second timeout
      
      // Store the timeout ID so we can clear it if we get a response
      window.currentSaveTimeout = saveTimeout;
      
      // Send save message to parent window
      window.parent.postMessage(
        {
          type: "SAVE_DATA",
          data: safeData
        },
        "*"
      );

      console.log("[Save] Message sent to parent window");
      showStatus("Saving your flashcards...");
    } else {
      // If we're in standalone mode, mark as saved immediately
      console.log("[Save] Running in standalone mode");
      setIsSaving(false);
      showStatus("Saved to browser storage");
    }
  }, [
    auth, 
    allCards, 
    subjectColorMapping, 
    spacedRepetitionData, 
    userTopics, 
    topicLists,
    topicMetadata,
    isSaving, 
    saveToLocalStorage, 
    showStatus, 
    ensureRecordId, 
    recordId
  ]);

  // Generate a random vibrant color
  const getRandomColor = useCallback(() => {
    // Default bright colors palette
    const brightColors = [
      "#e6194b", "#3cb44b", "#ffe119", "#0082c8", "#f58231", 
      "#911eb4", "#46f0f0", "#f032e6", "#d2f53c", "#fabebe", 
      "#008080", "#e6beff", "#aa6e28", "#fffac8", "#800000", 
      "#aaffc3", "#808000", "#ffd8b1", "#000080", "#808080",
      "#FF69B4", "#8B4513", "#00CED1", "#ADFF2F", "#DC143C",
    ];
    
    // Return a random color from the palette
    return brightColors[Math.floor(Math.random() * brightColors.length)];
  }, []);

  // Update color mappings - independent of other functions
  const updateColorMapping = useCallback(
    (subject, topic, color, updateTopics = false) => {
      if (!subject) return;
      
      // If color is null, use a default color or generate one
      const colorToUse = color || getRandomColor();
      console.log(`Updating color for subject: ${subject}, topic: ${topic || "none"}, color: ${colorToUse}, updateTopics: ${updateTopics}`);
      
      setSubjectColorMapping((prevMapping) => {
        const newMapping = { ...prevMapping };

        // Create subject entry if it doesn't exist
        if (!newMapping[subject]) {
          newMapping[subject] = { base: colorToUse, topics: {} };
        }

        // If it's a subject-level color update
        if (!topic || updateTopics) {
          // Update the base subject color
          newMapping[subject].base = colorToUse;
          
          // If we should update topic colors automatically
          if (updateTopics) {
            console.log(`Updating all topic colors for subject ${subject} based on ${colorToUse}`);
            
            // Get all topics for this subject from current cards
            const topicsForSubject = allCards
              .filter(card => (card.subject || "General") === subject)
              .map(card => card.topic || "General");
            
            // Remove duplicates and sort
            const uniqueTopics = [...new Set(topicsForSubject)].sort();
            
            console.log(`Found topics for subject ${subject}:`, uniqueTopics);
            
            // Generate a color for each topic
            if (uniqueTopics.length > 0) {
              uniqueTopics.forEach((topicName, index) => {
                // Skip the "General" topic as it should use the base color
                if (topicName === "General") return;
                
                // Generate a shade of the base color for this topic
                const topicColor = generateShade(colorToUse, index, uniqueTopics.length);
                console.log(`Generated color for ${topicName}: ${topicColor}`);
                
                // Ensure the topics object exists
                if (!newMapping[subject].topics) {
                  newMapping[subject].topics = {};
                }
                
                // Update the topic color
                newMapping[subject].topics[topicName] = topicColor;
              });
            }
          }
        } 
        // If it's a topic-level color update
        else if (topic) {
          // Ensure the subject exists in mapping with the correct structure
          if (!newMapping[subject]) {
            newMapping[subject] = { base: colorToUse, topics: {} };
          } else if (typeof newMapping[subject] === 'string') {
            // Convert string color to proper object structure
            const baseColor = newMapping[subject];
            newMapping[subject] = { base: baseColor, topics: {} };
          } else if (!newMapping[subject].topics) {
            // Ensure topics object exists
            newMapping[subject].topics = {};
          }
          
          // Update the specified topic color
          newMapping[subject].topics[topic] = colorToUse;
        }
        
        return newMapping;
      });
      
      // Also update the cards that use this subject/topic to reflect the new color
      setAllCards(prevCards => {
        const updatedCards = prevCards.map(card => {
          if ((card.subject || "General") === subject) {
            // If this is a topic-specific update and this card doesn't match, skip it
            if (topic && (card.topic || "General") !== topic && !updateTopics) {
              return card;
            }
            
            // Get the appropriate color based on the card's topic
            let newColor = colorToUse;
            if (topic && (card.topic || "General") === topic) {
              newColor = colorToUse;
            } else if (!topic && card.topic && card.topic !== "General" && updateTopics) {
              // For topic cards, get a shade of the subject color
              const topicsForSubject = [...new Set(
                allCards
                  .filter(c => (c.subject || "General") === subject)
                  .map(c => c.topic || "General")
              )].sort();
              
              const topicIndex = topicsForSubject.indexOf(card.topic);
              if (topicIndex !== -1) {
                newColor = generateShade(colorToUse, topicIndex, topicsForSubject.length);
              }
            }
            
            // Return updated card with new color
            return {
              ...card,
              cardColor: newColor,
              subjectColor: colorToUse,
              baseColor: subject === (card.subject || "General") ? colorToUse : card.baseColor
            };
          }
          return card;
        });
        
        // Log the first few cards for debugging
        if (updatedCards.length > 0) {
          console.log("Sample cards after color update:", updatedCards.slice(0, 3));
        }
        
        return updatedCards;
      });
      
      // Save changes
      setTimeout(() => saveToLocalStorage(), 100);
    },
    [allCards, generateShade, getRandomColor, saveToLocalStorage]
  );

  // Load data from localStorage with enhanced error recovery
  const loadFromLocalStorage = useCallback(() => {
    try {
      // First try to load the new versioned data format
      const loadResult = localStorageHelpers.loadData('flashcards_app', {
        cards: [],
        colorMapping: {},
        spacedRepetition: {
          box1: [], box2: [], box3: [], box4: [], box5: []
        },
        userTopics: {}
      });
      
      // Log the load operation
      dataLogger.logLoad('localStorage', loadResult);
      
      if (loadResult.success) {
        // Successfully loaded versioned data
        const versionedData = loadResult.data;
        
        // Update state with all data components
        if (versionedData.cards && Array.isArray(versionedData.cards)) {
          setAllCards(versionedData.cards);
          updateSpacedRepetitionData(versionedData.cards);
        }
        
        if (versionedData.colorMapping) {
          setSubjectColorMapping(versionedData.colorMapping);
        }
        
        if (versionedData.spacedRepetition) {
          setSpacedRepetitionData(versionedData.spacedRepetition);
        }
        
        if (versionedData.userTopics) {
          setUserTopics(versionedData.userTopics);
        }
        
        console.log(`Loaded data from localStorage using ${loadResult.source} source`);
        showStatus(`Data loaded from ${loadResult.source}`);

        // Restore multiple choice options
        restoreMultipleChoiceOptions(versionedData.cards);

        return;
      }
      
      // If new format failed, try legacy format as fallback
      console.log("Falling back to legacy localStorage format");
      
      const savedCards = localStorage.getItem('flashcards');
      const savedColorMapping = localStorage.getItem('colorMapping');
      const savedSpacedRepetition = localStorage.getItem('spacedRepetition');
      const savedUserTopics = localStorage.getItem('userTopics');
      
      let loadedData = false;
      
      if (savedCards) {
        const { valid, cleanedCards } = validateCards(safeParseJSON(savedCards, []));
        if (valid) {
          setAllCards(cleanedCards);
          updateSpacedRepetitionData(cleanedCards);
          loadedData = true;
        } else {
          console.warn("Invalid cards detected, using cleaned cards array");
          setAllCards(cleanedCards);
          updateSpacedRepetitionData(cleanedCards);
          loadedData = true;
        }
      }
      
      if (savedColorMapping) {
        setSubjectColorMapping(safeParseJSON(savedColorMapping, {}));
        loadedData = true;
      }
      
      if (savedSpacedRepetition) {
        setSpacedRepetitionData(safeParseJSON(savedSpacedRepetition, {
          box1: [], box2: [], box3: [], box4: [], box5: []
        }));
        loadedData = true;
      }
      
      if (savedUserTopics) {
        setUserTopics(safeParseJSON(savedUserTopics, {}));
        loadedData = true;
      }
      
      if (loadedData) {
        console.log("Loaded data from legacy localStorage format");
        
        // Create a backup in the new format for future use
        setTimeout(() => saveToLocalStorage(), 1000);
      } else {
        // Neither new nor legacy data found (e.g., first load or after clearing storage)
        console.log("No data found in new or legacy format. Initializing with defaults.");
        setAllCards([]);
        setSubjectColorMapping({});
        setSpacedRepetitionData({ box1: [], box2: [], box3: [], box4: [], box5: [] });
        setUserTopics({});
      }
    } catch (error) {
      console.error("Error loading from localStorage:", error);
      dataLogger.logError('localStorage_load', error);
      showStatus("Error loading data from local storage");
    }
  }, [updateSpacedRepetitionData, showStatus, saveToLocalStorage, setAllCards, setSubjectColorMapping, setSpacedRepetitionData, setUserTopics, restoreMultipleChoiceOptions]);

  // Add a ref to track if we've already initialized
  const hasInitialized = useRef(false);

  // Update the useEffect that calls loadFromLocalStorage
  useEffect(() => {
    if (!hasInitialized.current) {
      loadFromLocalStorage();
      hasInitialized.current = true;
    }
  }, [loadFromLocalStorage]);

  // Restore needed functions
  // Add a new card
  const addCard = useCallback(
    (card) => {
      const cardWithSpacedRep = {
        ...card,
        boxNum: 1,
        nextReviewDate: new Date().toISOString()
      };
      setAllCards((prevCards) => [...prevCards, cardWithSpacedRep]);
      setSpacedRepetitionData((prevData) => {
        const newData = { ...prevData };
        newData.box1.push({
          cardId: cardWithSpacedRep.id,
          lastReviewed: new Date().toISOString(),
          nextReviewDate: new Date().toISOString()
        });
        return newData;
      });
      if (card.subject && card.cardColor) {
        updateColorMapping(card.subject, card.topic, card.cardColor);
      }
      setTimeout(() => saveData(), 100);
      showStatus("Card added successfully!");
    },
    [updateColorMapping, saveData, showStatus]
  );

  // Delete a card
  const deleteCard = useCallback(
    (cardId) => {
      setAllCards((prevCards) => {
        const newCards = prevCards.filter((card) => card.id !== cardId);
        updateSpacedRepetitionData(newCards);
        return newCards;
      });
      setTimeout(() => saveData(), 100);
      showStatus("Card deleted");
    },
    [updateSpacedRepetitionData, saveData, showStatus]
  );

  // Update card properties
  const updateCard = useCallback(
    (updatedCard) => {
      setAllCards((prevCards) => {
        const updatedCards = prevCards.map((card) =>
          card.id === updatedCard.id ? { ...card, ...updatedCard } : card
        );
        updateSpacedRepetitionData(updatedCards);
        return updatedCards;
      });
      if (updatedCard.subject && updatedCard.cardColor) {
        updateColorMapping(updatedCard.subject, updatedCard.topic, updatedCard.cardColor);
      }
      setTimeout(() => saveData(), 100);
      showStatus("Card updated");
    },
    [updateSpacedRepetitionData, updateColorMapping, saveData, showStatus]
  );

  // Move a card to a specific box in spaced repetition
  const moveCardToBox = useCallback(
    (cardId, box) => {
      console.log(`Moving card ${cardId} to box ${box}`);
      const calculateNextReviewDate = (boxNumber) => {
        const today = new Date();
        let nextDate = new Date(today);
        switch (boxNumber) {
          case 1: nextDate.setDate(today.getDate() + 1); break;
          case 2: nextDate.setDate(today.getDate() + 2); break;
          case 3: nextDate.setDate(today.getDate() + 3); break;
          case 4: nextDate.setDate(today.getDate() + 7); break;
          case 5: nextDate.setDate(today.getDate() + 28); break;
          default: nextDate.setDate(today.getDate() + 1);
        }
        nextDate.setHours(0, 0, 0, 0);
        return nextDate.toISOString();
      };

      const stringCardId = String(cardId).trim();
      setSpacedRepetitionData((prevData) => {
        const newData = { ...prevData };
        for (let i = 1; i <= 5; i++) {
          newData[`box${i}`] = newData[`box${i}`].filter((item) => {
            if (typeof item === 'object' && item !== null) return item.cardId !== stringCardId;
            return String(item) !== stringCardId;
          });
        }
        const targetBox = `box${box}`;
        const nextReviewDate = calculateNextReviewDate(box);
        newData[targetBox].push({ cardId: stringCardId, lastReviewed: new Date().toISOString(), nextReviewDate });
        return newData;
      });

      setAllCards(prevCards => prevCards.map(card => {
        if (String(card.id).trim() === stringCardId) {
          return {
            ...card, boxNum: box,
            nextReviewDate: calculateNextReviewDate(box),
            lastReviewed: new Date().toISOString(),
            isReviewable: false
          };
        }
        return card;
      }));
      setTimeout(() => saveData(), 100);
      console.log(`Card ${cardId} moved to box ${box}`);
    },
    [saveData]
  );

  // Get cards for the current box in spaced repetition mode
  const getCardsForCurrentBox = useCallback(() => {
    const boxKey = `box${currentBox}`;
    const boxItems = spacedRepetitionData[boxKey] || [];
    if (boxItems.length === 0) return [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cardsForBox = [];
    for (const boxItem of boxItems) {
      let cardId, nextReviewDate, isReviewable = true;
      if (typeof boxItem === 'string') {
        cardId = boxItem; nextReviewDate = null;
      } else if (boxItem && typeof boxItem === 'object') {
        cardId = boxItem.cardId;
        if (boxItem.nextReviewDate) {
          try { nextReviewDate = new Date(boxItem.nextReviewDate); isReviewable = nextReviewDate <= today; } 
          catch (e) { console.warn(`Invalid date: ${boxItem.nextReviewDate}`); nextReviewDate = null; isReviewable = true; }
        }
      } else continue;
      if (!cardId) continue;
      const matchingCard = allCards.find(card => String(card.id).trim() === String(cardId).trim());
      if (matchingCard) {
        cardsForBox.push({ ...matchingCard, isReviewable, nextReviewDate: nextReviewDate ? nextReviewDate.toISOString() : null });
      } else console.warn(`Card ID ${cardId} not found`);
    }
    return cardsForBox;
  }, [currentBox, spacedRepetitionData, allCards]);

  // Extract the subjects from cards for the sidebar
  const getSubjects = useCallback(() => {
    if (!allCards || allCards.length === 0) return [];
    const subjectsMap = new Map();
    allCards.forEach(card => {
      const subject = card.subject || "General";
      if (!subjectsMap.has(subject)) {
        subjectsMap.set(subject, { name: subject, count: 0, color: null, timestamp: null });
      }
      const subjectData = subjectsMap.get(subject);
      subjectData.count += 1;
      if (card.timestamp) {
        const cardTime = new Date(card.timestamp).getTime();
        if (!subjectData.timestamp || cardTime < subjectData.timestamp) subjectData.timestamp = cardTime;
      }
      if (!subjectData.color && subjectColorMapping[subject]?.base) {
        subjectData.color = subjectColorMapping[subject].base;
      }
    });
    let subjectsArray = Array.from(subjectsMap.values());
    subjectsArray.sort((a, b) => {
      if (!a.timestamp && !b.timestamp) return 0;
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return a.timestamp - b.timestamp;
    });
    return subjectsArray;
  }, [allCards, subjectColorMapping]);

  // Filter cards by subject and topic
  const getFilteredCards = useCallback(() => {
    let filtered = [...allCards];
    if (selectedSubject) {
      filtered = filtered.filter((card) => (card.subject || "General") === selectedSubject);
    }
    if (selectedTopic) {
      filtered = filtered.filter((card) => (card.topic || "General") === selectedTopic);
    }
    return filtered;
  }, [allCards, selectedSubject, selectedTopic]);
  
  // Generate a color for a subject or topic
  const getColorForSubjectTopic = useCallback(
    (subject, topic) => {
      const defaultColor = currentSubjectColor;
      if (subjectColorMapping[subject]) {
        if (topic && subjectColorMapping[subject].topics && subjectColorMapping[subject].topics[topic]) {
          return subjectColorMapping[subject].topics[topic];
        } 
        else if (topic && topic !== "General" && subjectColorMapping[subject].base) {
          const topicsForSubject = [...new Set(allCards.filter(card => (card.subject || "General") === subject).map(card => card.topic || "General"))].sort();
          const topicIndex = topicsForSubject.indexOf(topic);
          if (topicIndex !== -1) {
            const shade = generateShade(subjectColorMapping[subject].base, topicIndex, Math.max(topicsForSubject.length, 5));
            setSubjectColorMapping(prev => {
              const newMapping = { ...prev };
              if (!newMapping[subject].topics) newMapping[subject].topics = {};
              newMapping[subject].topics[topic] = shade;
              return newMapping;
            });
            return shade;
          }
        }
        return subjectColorMapping[subject].base;
      }
      return defaultColor;
    },
    [subjectColorMapping, currentSubjectColor, generateShade, allCards]
  );

  // Handle receiving messages from parent window (Knack)
  useEffect(() => {
    // Restore handleVerificationMessage definition
    const handleVerificationMessage = (event) => {
      const { type, success, error, reason } = event.data;
      console.log(`[Verification] Received ${type}`, event.data);
      switch (type) {
        case 'VERIFICATION_COMPLETE':
          if (window.currentSaveTimeout) { clearTimeout(window.currentSaveTimeout); window.currentSaveTimeout = null; }
          if (success) showStatus("Save verified successfully");
          else showStatus("Save completed, verification pending");
          break;
        case 'VERIFICATION_SKIPPED': console.log(`[Verification] Skipped: ${reason}`); break;
        case 'VERIFICATION_FAILED': console.error(`[Verification] Failed: ${error}`); showStatus("Warning: Save verification failed"); break;
        default: console.log(`[Verification] Unhandled message type: ${type}`);
      }
    };

    const handleMessage = async (event) => {
      // Avoid logging every message to reduce console spam
      if (event.data && event.data.type !== 'PING') {
        console.log(`[Message Handler ${new Date().toISOString()}] From parent: ${event.data?.type}`);
      }

      if (event.data && event.data.type) {
        switch (event.data.type) {
          case "KNACK_USER_INFO":
            console.log("[App.js] Received KNACK_USER_INFO from parent:", event.data.data);
            // IMPORTANT: Only process auth once to prevent loops
            if (authProcessedRef.current) {
              console.log("[User Info] Already processed, ignoring duplicate message");
              return;
            }
            
            // Set the flag immediately to prevent race conditions
            authProcessedRef.current = true;
            console.log("[User Info] First-time processing of user data");
            
            // Process student data if we have a role of "student"
            const userRole = event.data.data?.role || "";
            let userStudentData = {};
            
            // Extract school data from any user
            const schoolData = cleanHtmlTags(event.data.data?.field_122 || "");
            
            // Process tutor information
            let tutorData = "";
            // If there's a tutor field directly in the data, use it
            if (event.data.data?.field_1682) {
              tutorData = cleanHtmlTags(event.data.data.field_1682 || "");
            }
            
            if (userRole === "student" && event.data.data?.studentData) {
              try {
                // Extract student data (cleaning HTML tags if needed)
                const studentData = event.data.data.studentData || {};
                
                // Extract yearGroup, tutorGroup and tutor from studentData
                userStudentData = {
                  tutorGroup: cleanHtmlTags(studentData.field_565 || ""),
                  yearGroup: cleanHtmlTags(studentData.field_548 || ""),
                  tutor: cleanHtmlTags(studentData.field_1682 || tutorData || ""), // Use direct field if available
                  school: schoolData
                };
                
                console.log("[User Info] Processed student data");
              } catch (e) {
                console.error("[User Info] Error processing student data:", e);
              }
            } else {
              // For non-student users, just extract the school data
              userStudentData = {
                school: schoolData,
                tutor: tutorData // Include tutor data for all user types
              };
            }
            
            // Initialize AuthManager with the complete authentication data
            const authData = {
              ...event.data.data,
              ...userStudentData
            };
            
            console.log("[App.js] Setting auth state:", authData);
            // Set auth state for React components
            setAuth(authData);
            
            // Initialize the centralized AuthManager with the same data
            initializeAuthManager(authData);
            console.log("[User Info] Initialized AuthManager with user data");

            // If user data was included, process it
            if (event.data.data?.userData) {
              try {
                // Use our safe parsing function to handle potential corrupted JSON
                const userData = safeParseJSON(event.data.data.userData);

                console.log("[App.js] Processing userData from KNACK_USER_INFO:", userData);
                // Store the recordId if available
                if (userData.recordId) {
                  console.log("[App.js] Setting recordId state:", userData.recordId);
                  setRecordId(userData.recordId);
                  console.log("[User Info] Stored recordId:", userData.recordId);
                  
                  // Store in localStorage for recovery
                  try {
                    localStorage.setItem('flashcards_auth', JSON.stringify({ recordId: userData.recordId }));
                    console.log("[User Info] Stored record ID in localStorage for recovery");
                  } catch (e) {
                    console.error("[User Info] Error storing record ID in localStorage:", e);
                  }
                }

                // Process cards
                if (userData.cards && Array.isArray(userData.cards)) {
                  const restoredCards = restoreMultipleChoiceOptions(userData.cards);
                  setAllCards(restoredCards);
                  updateSpacedRepetitionData(restoredCards);
                  console.log("[User Info] Restored multiple choice options for cards");
                }
                
                // Process color mapping
                if (userData.colorMapping) {
                  setSubjectColorMapping(userData.colorMapping);
                }
                
                // Process spaced repetition data if separate
                if (userData.spacedRepetition) {
                  setSpacedRepetitionData(userData.spacedRepetition);
                }
                
                // Process user topics if available
                if (userData.userTopics) {
                  setUserTopics(userData.userTopics);
                }
                
                // Process topic lists if available
                if (userData.topicLists && Array.isArray(userData.topicLists)) {
                  setTopicLists(userData.topicLists);
                  console.log("[User Info] Loaded topic lists from Knack:", userData.topicLists.length);
                }
                
                // Process topic metadata if available
                if (userData.topicMetadata && Array.isArray(userData.topicMetadata)) {
                  setTopicMetadata(userData.topicMetadata);
                  console.log("[User Info] Loaded topic metadata from Knack:", userData.topicMetadata.length);
                }
                
                // Additional logging to help with debugging
                console.log("[User Info] Successfully processed user data from Knack");
              } catch (e) {
                console.error("[User Info] Error processing userData JSON:", e);
                showStatus("Error loading your data. Loading from local storage instead.");
                loadFromLocalStorage();
              }
            } else {
              // If no user data, load from localStorage
              console.log("[User Info] No user data received, falling back to localStorage");
              loadFromLocalStorage();
            }
            
            console.log("[App.js] Setting loading state to false");
            setLoading(false);
            
            // Confirm receipt of auth info (only do this once)
            if (window.parent !== window) {
              console.log("[User Info] Sending AUTH_CONFIRMED message");
              window.parent.postMessage({ type: "AUTH_CONFIRMED" }, "*");
            }
            break;

          case "SAVE_RESULT":
            console.log("[Save Result] Received:", event.data.success);
            
            // Clear any save timeouts
            if (window.currentSaveTimeout) {
              clearTimeout(window.currentSaveTimeout);
              window.currentSaveTimeout = null;
            }
            
            setIsSaving(false);
            if (event.data.success) {
              showStatus("Saved successfully!");
            } else {
              showStatus("Error saving data. Changes saved locally.");
            }
            break;
            
          case "LOAD_SAVED_DATA":
            console.log("[Load Data] Received updated data from Knack");

            if (event.data.data) {
              try {
                // Process cards
                if (event.data.data.cards && Array.isArray(event.data.data.cards)) {
                  const restoredCards = restoreMultipleChoiceOptions(event.data.data.cards);
                  setAllCards(restoredCards);
                  updateSpacedRepetitionData(restoredCards);
                  console.log("[Load Data] Restored multiple choice options for cards");
                }

                // Process color mapping
                if (event.data.data.colorMapping) {
                  setSubjectColorMapping(safeParseJSON(event.data.data.colorMapping));
                }

                // Process spaced repetition data if separate
                if (event.data.data.spacedRepetition) {
                  setSpacedRepetitionData(safeParseJSON(event.data.data.spacedRepetition));
                }
                
                // Process user topics if available
                if (event.data.data.userTopics) {
                  setUserTopics(safeParseJSON(event.data.data.userTopics));
                }
                
                // Process topic lists if available
                if (event.data.data.topicLists) {
                  setTopicLists(safeParseJSON(event.data.data.topicLists));
                  console.log("[Load Data] Loaded topic lists:", 
                    Array.isArray(safeParseJSON(event.data.data.topicLists)) ? 
                    safeParseJSON(event.data.data.topicLists).length : 'none');
                }
                
                // Process topic metadata if available
                if (event.data.data.topicMetadata) {
                  setTopicMetadata(safeParseJSON(event.data.data.topicMetadata));
                  console.log("[Load Data] Loaded topic metadata:",
                    Array.isArray(safeParseJSON(event.data.data.topicMetadata)) ?
                    safeParseJSON(event.data.data.topicMetadata).length : 'none');
                }
                
                showStatus("Updated with latest data from server");
              } catch (error) {
                console.error("[Load Data] Error processing updated data:", error);
                showStatus("Error loading updated data");
              }
            }
            break;

          case "ADD_TO_BANK_RESULT":
            console.log("[Add To Bank Result] Received:", event.data);
            if (event.data.success) {
              showStatus("Cards added to bank successfully!");
              
              // If shouldReload flag is set, request updated data instead of full page reload
              if (event.data.shouldReload) {
                console.log("[Add To Bank Result] Requesting updated data...");
                setLoading(true);
                setLoadingMessage("Refreshing card data...");
                
                // Send a message to parent window to request updated data
                if (window.parent !== window) {
                  window.parent.postMessage({
                    type: "REQUEST_UPDATED_DATA",
                    data: { recordId: recordId }
                  }, "*");
                  
                  // No fallback timeout - wait for KNACK_DATA message instead
                  // The data will eventually come through even if it takes longer than 5 seconds
                } else {
                  // If we're not in an iframe, just reload from localStorage
                  loadFromLocalStorage();
                  setLoading(false);
                }
              }
            } else {
              showStatus("Error adding cards to bank. Try refreshing the page.");
              
              // If there was an error, try to refresh data anyway after a short delay
              // This can help recover from temporary issues
              setTimeout(() => {
                if (window.parent !== window) {
                  window.parent.postMessage({
                    type: "REQUEST_UPDATED_DATA",
                    data: { recordId: recordId }
                  }, "*");
                  
                  console.log("[Add To Bank Result] Requested data refresh after error");
                }
              }, 2000);
            }
            break;
            
          case "TOPIC_SHELLS_CREATED":
            console.log("[Topic Shells] Created successfully:", event.data);
            showStatus(`Created ${event.data.count} topic shells!`);
            
            // If shouldReload flag is set, request updated data instead of full page reload
            if (event.data.shouldReload) {
              console.log("[Topic Shells] Requesting updated data...");
              setLoading(true);
              setLoadingMessage("Refreshing card data...");
              
              // Send a message to parent window to request updated data
              if (window.parent !== window) {
                window.parent.postMessage({
                  type: "REQUEST_UPDATED_DATA",
                  data: { recordId: recordId }
                }, "*");
                
                // No fallback timeout - wait for KNACK_DATA message instead
                // The data will eventually come through even if it takes longer than 5 seconds
              } else {
                // If we're not in an iframe, just reload from localStorage
                loadFromLocalStorage();
                setLoading(false);
              }
            }
            break;
            
          case "RELOAD_APP_DATA":
            console.log("[Reload] Explicit reload request received");
            showStatus("Refreshing data...");
            
            // Instead of reloading the whole page, use the data refresh mechanism
            if (window.parent !== window) {
              window.parent.postMessage({
                type: "REQUEST_UPDATED_DATA",
                data: { recordId: recordId }
              }, "*");
              
              console.log("[Reload] Requested updated data instead of full page reload");
              
              // Set a brief loading state but don't show full initialization screen
              setLoadingMessage("Refreshing your flashcards...");
              
              // Add a timeout to clear loading state in case no response is received
              setTimeout(() => {
                setLoading(false);
                setLoadingMessage("");
              }, 5000);
            } else {
              // If not in an iframe, refresh from localStorage
              loadFromLocalStorage();
            }
            break;

          case "REQUEST_REFRESH":
            console.log("[Refresh] App refresh requested:", event.data);
            
            // Instead of setting loading state which shows init screen,
            // just reload the data silently
            if (window.parent !== window) {
              window.parent.postMessage({
                type: "REQUEST_UPDATED_DATA",
                data: { recordId: recordId || event.data?.data?.recordId }
              }, "*");
              
              console.log("[Refresh] Requested data refresh without showing loading screen");
              
              // Add a timeout to clear loading state in case the response never comes
              setTimeout(() => {
                setLoading(false);
                setLoadingMessage("");
              }, 3000);
            } else {
              // If we're not in an iframe, just reload from localStorage
              loadFromLocalStorage();
              // Ensure we're not in loading state
              setLoading(false);
              setLoadingMessage("");
            }
            break;

          case "SAVE_OPERATION_QUEUED":
            // Data save has been queued on the server
            console.log("[Message Handler] Save operation queued");
            
            // Don't reset the saving state - keep it active
            // since we're still in the save process
            
            showStatus("Your flashcards are being saved (queued)...");
            break;

          case "SAVE_OPERATION_FAILED":
            console.error("[Message Handler] Save operation failed:", event.data.error);
            
            // Clear any save timeouts
            if (window.currentSaveTimeout) {
              clearTimeout(window.currentSaveTimeout);
              window.currentSaveTimeout = null;
            }
            
            setIsSaving(false);
            showStatus("Error saving data: " + (event.data.error || "Unknown error"));
            break;
            
          case "KNACK_DATA":
            console.log("Received data from Knack:", event.data);
            
            if (event.data.cards && Array.isArray(event.data.cards)) {
              try {
                // Restore multiple choice options if they exist
                const restoredCards = restoreMultipleChoiceOptions(event.data.cards);
                
                // Update app state with the loaded cards
                setAllCards(restoredCards);
                console.log(`Loaded ${restoredCards.length} cards from Knack and restored multiple choice options`);
                
                // Load color mapping
                if (event.data.colorMapping) {
                  setSubjectColorMapping(event.data.colorMapping);
                  console.log("Loaded color mapping from Knack");
                }
                
                // Load spaced repetition data
                if (event.data.spacedRepetition) {
                  setSpacedRepetitionData(event.data.spacedRepetition);
                  console.log("Loaded spaced repetition data from Knack");
                }
                
                // Load topic lists
                if (event.data.topicLists && Array.isArray(event.data.topicLists)) {
                  setTopicLists(event.data.topicLists);
                  console.log(`Loaded ${event.data.topicLists.length} topic lists from Knack`);
                }
                
                // Load topic metadata
                if (event.data.topicMetadata && Array.isArray(event.data.topicMetadata)) {
                  setTopicMetadata(event.data.topicMetadata);
                  console.log(`Loaded ${event.data.topicMetadata.length} topic metadata entries from Knack`);
                }
                
                // Always ensure loading state is cleared
                setLoading(false);
                setLoadingMessage("");

                // Redirect back to card bank if refresh happened from AI Generator
                if (view === 'aiGenerator') {
                  console.log("[KNACK_DATA Handler] Refresh likely completed after AI generation, redirecting to cardBank.");
                  setView('cardBank');
                }

              } catch (error) {
                console.error("Error processing Knack data:", error);
                setLoading(false);
                setLoadingMessage("");
                showStatus("Error loading cards. Please refresh the page.");
              }
            }
            break;

          case "AUTH_ERROR":
            console.error("Authentication error received:", event.data.data?.message || "Unknown auth error");
            
            // Ensure loading state is cleared first
            setLoading(false);
            setLoadingMessage("");
            
            // Show error message to user
            showStatus(event.data.data?.message || "Authentication error. Please refresh the page.");
            
            // If we're in the AIGenerator view, consider returning to card bank
            if (view === "aiGenerator") {
              setTimeout(() => {
                // Give user time to see the error message before redirecting
                setView("cardBank");
              }, 3000);
            }
            break;

          case "REQUEST_TOKEN_REFRESH":
            console.log("[Token] Using AuthManager to handle token refresh");
            
            // Call our new centralized token refresh utility
            handleTokenRefreshRequest(
              recordId,
              showStatus,
              setLoading,
              loadFromLocalStorage
            ).then(success => {
              if (success) {
                console.log("[Token] Token refresh initiated successfully");
              } else {
                console.warn("[Token] Token refresh could not be initiated");
              }
            });
            break;

          case "VERIFICATION_COMPLETE":
          case "VERIFICATION_SKIPPED":
          case "VERIFICATION_FAILED":
            handleVerificationMessage(event);
            break;

          default:
            console.log("[Message Handler] Unknown message type:", event.data.type);
        }
      }
    };

    // Set up listener for messages from parent window
    window.addEventListener("message", handleMessage);

    // Cleanup
    return () => {
      window.removeEventListener("message", handleMessage);
    };
  }, [getUserInfo, recordId, view, updateSpacedRepetitionData, loadFromLocalStorage]);

  // Show loading state
  console.log("[App.js] <<< Reached return statement");
  if (loading) {
    return <LoadingSpinner message={loadingMessage} />;
  }

  // Show error state
  if (error) {
    return (
      <div className="app error">
        <h2>Error</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Refresh</button>
      </div>
    );
  }

  return (
    <div className="app-container">
      {loading ? (
        <LoadingSpinner message={loadingMessage} />
      ) : (
        <>
          <Header
            userInfo={getUserInfo()}
            currentView={view}
            onViewChange={setView}
            onSave={saveData}
            isSaving={isSaving}
            onPrintAll={() => {}}
            onCreateCard={() => setCardCreationModalOpen(true)}
            currentBox={currentBox}
            onSelectBox={setCurrentBox}
            spacedRepetitionData={spacedRepetitionData}
          />
          
          {statusMessage && (
            <div className="status-message">
              <p>{statusMessage}</p>
            </div>
          )}
          
          {/* Topic List Modal */}
          <TopicListSyncManager
            isOpen={topicListModalOpen && topicListSubject}
            subject={topicListSubject}
            examBoard={topicListExamBoard}
            examType={topicListExamType}
            onClose={() => setTopicListModalOpen(false)}
            onSelectTopic={(topic) => setSelectedTopic(topic)}
            onGenerateCards={(topic) => {
              setSelectedTopic(topic);
              setView("aiGenerator");
            }}
            auth={auth}
            userId={auth?.id}
          />

          {view === "cardBank" && (
            <div className="card-bank-view">
              {printModalOpen && (
                <PrintModal 
                  cards={cardsToPrint} 
                  title={printTitle} 
                  onClose={() => setPrintModalOpen(false)} 
                />
              )}
              
              {/* Card Creation Modal */}
              {cardCreationModalOpen && (
                <div className="modal-overlay" onClick={() => setCardCreationModalOpen(false)}>
                  <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                    <button className="modal-close-btn" onClick={() => setCardCreationModalOpen(false)}>×</button>
                    <h2>Create Flashcards</h2>
                    <div className="modal-options">
                      <button 
                        className="primary-button"
                        onClick={() => {
                          setCardCreationModalOpen(false);
                          setView("aiGenerator");
                        }}
                      >
                        <span className="button-icon">🤖</span> Generate Cards with AI
                      </button>
                      <div className="option-divider">or</div>
                      <button 
                        className="secondary-button"
                        onClick={() => {
                          setCardCreationModalOpen(false);
                          setView("manualCreate");
                        }}
                      >
                        <span className="button-icon">✍️</span> Create Cards Manually
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              <div className="bank-container full-width">
                <div className="bank-content">
                  {/* Added header showing total card count */}
                  <div className="bank-content-header">
                    <h2>All Flashcards ({getFilteredCards().length})</h2>
                    <button 
                      className="save-icon-button" 
                      onClick={saveData} 
                      disabled={isSaving}
                      title="Save All Changes"
                    >
                      {isSaving ? '⏳' : '💾'}
                    </button>
                  </div>
                  
                  {/* Show empty state or card list based on whether there are cards */}
                  {allCards.length === 0 ? (
                    <div className="empty-card-bank">
                      <h3>No flashcards yet</h3>
                      <p>Create your first flashcard to get started!</p>
                      <button className="primary-button" onClick={() => setCardCreationModalOpen(true)}>
                        Create Flashcard
                      </button>
                    </div>
                  ) : (
                    <FlashcardList 
                      cards={getFilteredCards()} 
                      onDeleteCard={deleteCard} 
                      onUpdateCard={updateCard}
                      onViewTopicList={(subject) => {
                        setSelectedSubject(subject);
                        setSelectedTopic(null);
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {view === "manualCreate" && (
            <div className="create-card-container">
              <CardCreator
                onAddCard={addCard}
                onCancel={() => setView("cardBank")}
                subjects={getSubjects()}
                getTopicsForSubject={(subject) => getTopicsForSubject(subject)}
                currentColor={currentSubjectColor}
                onColorChange={setCurrentSubjectColor}
                getColorForSubjectTopic={(subject, topic) => getColorForSubjectTopic(subject, topic)}
                updateColorMapping={updateColorMapping}
              />
            </div>
          )}

          {view === "aiGenerator" && (
            <AICardGenerator
              onAddCard={addCard}
              onClose={() => setView("cardBank")}
              subjects={getSubjects()}
              auth={auth}
              userId={auth?.id}
              initialSubject={selectedSubject}
              initialTopic={selectedTopic}
              examBoard={topicListExamBoard}
              examType={topicListExamType}
            />
          )}

          {view === "spacedRepetition" && (
            <SpacedRepetition
              cards={getCardsForCurrentBox()}
              currentBox={currentBox}
              spacedRepetitionData={spacedRepetitionData}
              onSelectBox={setCurrentBox}
              onMoveCard={moveCardToBox}
              onReturnToBank={() => setView("cardBank")}
            />
          )}
        </>
      )}
    </div>
  );
}

export default App;
