function initializeFlashcardApp() {
  console.log("Initializing Flashcard React app");
  
  // Try to load services first
  loadServices();
  
  // Rest of the existing function...
}

        return;
      }
      
      // First try to use MessageHandler if available
      if (messageHandler) {
        // Forward the message to MessageHandler
        messageHandler.handleMessage(event);
        return;
      }
      
      // Fall back to legacy message handling if MessageHandler is not available
      if (event.data && event.data.type) {
        switch(event.data.type) {
          case 'APP_READY':
            // Only handle APP_READY once to prevent loops
            if (appReadyHandled) {
              console.log("Flashcard app: Ignoring duplicate APP_READY message");
              return;
            }
            
            // Mark as handled immediately to prevent race conditions
            appReadyHandled = true;
            console.log("Flashcard app: React app is ready, sending user info (first time)");
            
// knack-integration.js - Safe for public GitHub repository
            // First, get user data from Knack
            loadFlashcardUserData(user.id, function(userData) {
              // Rest of the existing APP_READY handler...
              // Keep this code intact
              
              // Check again to prevent double-handling due to async operations
              if (authSent) {
                console.log("Flashcard app: Auth already sent, skipping duplicate send");
                return;
              }
              
              // Include connection field IDs in the data sent to the React app
              const userDataToSend = {
                id: user.id,
                email: user.email,
                name: user.name || '',
                token: userToken,
                appId: appId,
                userData: userData || {},
                // Add connection field IDs
                emailId: currentUser.emailId,
                schoolId: currentUser.schoolId,
                tutorId: currentUser.tutorId,
                roleId: currentUser.roleId
              };
              
              // Send authentication and user data to the iframe only if not already sent
              if (!authSent) {
                iframe.contentWindow.postMessage({
                  type: 'KNACK_USER_INFO',
                  data: userDataToSend
                }, '*');
                
                authSent = true;
                console.log("Flashcard app: Sent user info to React app");
              }
            });
            break;
            
          case 'SAVE_DATA':
            console.log(`Flashcard app [${new Date().toISOString()}]: Saving data from React app:`, event.data.data);
            debugLog("SAVE_DATA REQUEST RECEIVED", {
              preserveFields: event.data.data.preserveFields,
              hasRecordId: event.data.data.recordId ? "yes" : "no",
              timestamp: new Date().toISOString()
            });
            
            // Use our new handleSaveData function
            handleSaveData(event.data.data)
              .then(() => {
                // Notify about the save operation being completed
                iframe.contentWindow.postMessage({
                  type: 'SAVE_RESULT',
                  success: true,
                  timestamp: new Date().toISOString()
                }, '*');
              })
              .catch(error => {
                // Notify about the save operation failing
                iframe.contentWindow.postMessage({
                  type: 'SAVE_RESULT',
                  success: false,
                  error: error.message || "Unknown error",
                  timestamp: new Date().toISOString()
                }, '*');
              });
            break;
            
          case 'AUTH_CONFIRMED':
            console.log("Flashcard app: Authentication confirmed by React app");
            
            // Hide loading indicator and show iframe
            loadingDiv.style.display = 'none';
            iframe.style.display = 'block';
            break;
            
          case 'ADD_TO_BANK':
            console.log("Flashcard app: Adding cards to bank:", event.data.data);
            
            // Prevent multiple operations by setting a flag
            if (window.addToBankInProgress) {
              console.log("Add to bank operation already in progress, ignoring duplicate request");
              return;
            }
            
            window.addToBankInProgress = true;
            
            // Use our Promise-based approach
            handleAddToBankPromise(event.data.data)
              .then((success) => {
                // Notify the React app about the result
                iframe.contentWindow.postMessage({
                  type: 'ADD_TO_BANK_RESULT',
                  success: true,
                  shouldReload: true
                }, '*');
                
                // Wait before sending a update message to ensure database commits are complete
                setTimeout(() => {
                  iframe.contentWindow.postMessage({
                    type: 'REQUEST_UPDATED_DATA',
                    recordId: recordId,
                    timestamp: new Date().toISOString()
                  }, '*');
                  
                  // Reset flag
                  window.addToBankInProgress = false;
                }, 2000); // Keep 2 second delay for safer operation
              })
              .catch((error) => {
                console.error("Failed to add cards to bank:", error);
                
                // Notify about failure
                iframe.contentWindow.postMessage({
                  type: 'ADD_TO_BANK_RESULT',
                  success: false,
                  error: error.message
                }, '*');
                
                // Reset flag
                window.addToBankInProgress = false;
              });
            break;
            
          case 'TOPIC_LISTS_UPDATED':
            console.log(`Flashcard app [${new Date().toISOString()}]: Message from React app: TOPIC_LISTS_UPDATED`);
            debugLog("MESSAGE RECEIVED", {
              type: "TOPIC_LISTS_UPDATED",
              timestamp: new Date().toISOString(),
              hasData: event.data.data ? "yes" : "no"
            });
            
            // Create topic shells for the updated topic lists
            if (event.data.data && event.data.data.topicLists && event.data.data.recordId) {
              console.log(`Flashcard app [${new Date().toISOString()}]: Creating topic shells for updated topic lists`);
              createTopicShellsFromLists(event.data.data.topicLists, event.data.data.recordId);
              
              // Added: Force reload the parent page after topic shells are created
              setTimeout(() => {
                window.location.reload();
              }, 2000);
            } else {
              // If we don't have the data in the message, try to load it
              const userId = user.id;
              loadFlashcardUserData(userId, function(userData) {
                if (userData && userData.recordId && userData.topicLists && userData.topicLists.length > 0) {
                  console.log(`Flashcard app [${new Date().toISOString()}]: Creating topic shells from loaded topic lists`);
                  createTopicShellsFromLists(userData.topicLists, userData.recordId);
                  
                  // Added: Force reload the parent page after topic shells are created
                  setTimeout(() => {
                    window.location.reload();
                  }, 2000);
                } else {
                  console.warn(`Flashcard app [${new Date().toISOString()}]: No topic lists found for shell creation`);
                }
              });
            }
            break;
            
          case 'TRIGGER_SAVE':
            console.log("Flashcard app: Triggered save from React app");
            // This is a hint to also save to the card bank
            // Trigger ADD_TO_BANK operation for any unsaved cards
            if (event.data.cards && Array.isArray(event.data.cards) && event.data.cards.length > 0) {
              // If we have cards in the trigger message, add them to bank
              handleAddToBank(event.data, function(success) {
                // We don't need to notify about this automatic operation
              });
            }
            break;
            
          // Added: Handle explicit reload requests
case 'RELOAD_APP_DATA':
  console.log(`Flashcard app [${new Date().toISOString()}]: Received reload request`);
  
  // Instead of reloading the page, send updated data to the iframe
  if (iframe && iframe.contentWindow) {
    // Get the user ID for data loading
    const reloadUserId = user.id;
    
    // Load the latest data and send it to the iframe
    loadFlashcardUserData(reloadUserId, function(userData) {
      if (userData) {
        console.log(`Flashcard app [${new Date().toISOString()}]: Sending refreshed data to React app instead of reloading page`);
        
        // Send updated data back to the React app
        iframe.contentWindow.postMessage({
          type: 'KNACK_DATA',
          cards: userData.cards || [],
          colorMapping: userData.colorMapping || {},
          topicLists: userData.topicLists || [],
          topicMetadata: userData.topicMetadata || [],
          recordId: userData.recordId,
          auth: {
            id: user.id,
            email: user.email,
            name: user.name || ''
          },
          timestamp: new Date().toISOString()
        }, '*');
      } else {
        console.error(`Flashcard app [${new Date().toISOString()}]: Error loading updated data for reload`);
        
        // As a last resort if data loading fails, notify the iframe
        iframe.contentWindow.postMessage({
          type: 'DATA_REFRESH_ERROR',
          error: 'Failed to load data for reload'
        }, '*');
      }
    });
  } else {
    // If we can't communicate with the iframe, fall back to a full page reload
    console.log(`Flashcard app [${new Date().toISOString()}]: No iframe to communicate with, falling back to full page reload`);
    window.location.reload();
  }
  break;
  
// Add handler for AUTH_REFRESH_NEEDED message
case 'AUTH_REFRESH_NEEDED':
  console.log(`Flashcard app [${new Date().toISOString()}]: Authentication refresh needed`);
  
  // Attempt to refresh the auth token
  try {
    // First check if we can get a fresh token from Knack
    const currentToken = Knack.getUserToken();
    
    if (currentToken) {
      console.log(`Flashcard app [${new Date().toISOString()}]: Refreshing authentication with current token`);
      
      // Send the current token back to the React app
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'AUTH_REFRESH',
          data: {
            token: currentToken,
            userId: user.id,
            email: user.email,
            name: user.name || ''
          },
          timestamp: new Date().toISOString()
        }, '*');
        
        console.log(`Flashcard app [${new Date().toISOString()}]: Sent refreshed auth token to React app`);
      }
    } else {
      console.error(`Flashcard app [${new Date().toISOString()}]: Cannot refresh token - not available from Knack`);
      
      // Force reload as a last resort
      setTimeout(() => {
        console.log(`Flashcard app [${new Date().toISOString()}]: Forcing page reload to refresh authentication`);
        window.location.reload();
      }, 1000);
    }
  } catch (error) {
    console.error(`Flashcard app [${new Date().toISOString()}]: Error refreshing authentication:`, error);
    
    // Force reload as a last resort
    setTimeout(() => {
      console.log(`Flashcard app [${new Date().toISOString()}]: Forcing page reload to refresh authentication`);
      window.location.reload();
    }, 1000);
  }
  break;
  
// Add handler for REQUEST_TOKEN_REFRESH message
case 'REQUEST_TOKEN_REFRESH':
  handleTokenRefresh();
  break;
            
          // Add handler for REQUEST_UPDATED_DATA message
          case 'REQUEST_UPDATED_DATA':
            console.log(`Flashcard app [${new Date().toISOString()}]: Requested updated data`);
            
            // Get the record ID from the message or use the current user
            const dataUserId = user.id;
            const dataRecordId = event.data.recordId;
            
            if (!dataRecordId) {
              console.error("Flashcard app: Cannot refresh data - missing record ID");
              iframe.contentWindow.postMessage({
                type: 'DATA_REFRESH_ERROR',
                error: 'Missing record ID'
              }, '*');
              return;
            }
            
            // Load the latest data directly
            loadFlashcardUserData(dataUserId, function(userData) {
              if (userData) {
                console.log(`Flashcard app [${new Date().toISOString()}]: Sending refreshed data to React app`);
                
                // Send updated data back to the React app
                iframe.contentWindow.postMessage({
                  type: 'KNACK_DATA',
                  cards: userData.cards || [],
                  colorMapping: userData.colorMapping || {},
                  topicLists: userData.topicLists || [],
                  topicMetadata: userData.topicMetadata || [],
                  recordId: dataRecordId,
                  auth: {
                    id: user.id,
                    email: user.email,
                    name: user.name || ''
                  },
                  timestamp: new Date().toISOString()
                }, '*');
              } else {
                console.error(`Flashcard app [${new Date().toISOString()}]: Error loading updated data`);
                iframe.contentWindow.postMessage({
                  type: 'DATA_REFRESH_ERROR',
                  error: 'Failed to load data'
                }, '*');
              }
            });
            break;
            
          // Add handler for REQUEST_RECORD_ID message
          case 'REQUEST_RECORD_ID':
            console.log(`Flashcard app [${new Date().toISOString()}]: Record ID requested from React app`);
            
            // Get the user's record ID
            const currentUserId = user.id;
            
            // Look up the record ID for this user
            loadFlashcardUserData(currentUserId, function(userData) {
              if (userData && userData.recordId) {
                console.log(`Flashcard app [${new Date().toISOString()}]: Found record ID for user: ${userData.recordId}`);
                
                // Send the record ID back to the React app
                iframe.contentWindow.postMessage({
                  type: 'RECORD_ID_RESPONSE',
                  recordId: userData.recordId,
                  timestamp: new Date().toISOString()
                }, '*');
              } else {
                console.error(`Flashcard app [${new Date().toISOString()}]: Could not find record ID for user ${currentUserId}`);
                
                // Send an error response
                iframe.contentWindow.postMessage({
                  type: 'RECORD_ID_ERROR',
                  error: 'Record ID not found',
                  timestamp: new Date().toISOString()
                }, '*');
              }
            });
            break;

      case 'PERSISTENCE_SERVICES_READY':
        console.log("Flashcard app: Received persistence services from React app");
        
        // Store the services in window for use by our functions
        if (event.data.services) {
          window.unifiedPersistenceManager = event.data.services.unifiedPersistenceManager;
          window.topicShellManager = event.data.services.topicShellManager;
          window.metadataManager = event.data.services.metadataManager;
          window.colorManager = event.data.services.colorManager;
          window.dataOperationQueue = event.data.services.dataOperationQueue;
          
          console.log("Flashcard app: Persistence services ready for use");
          
          // Load services to verify they're available
          if (loadPersistenceServices()) {
            // Acknowledge receipt of services
            iframe.contentWindow.postMessage({
              type: 'PERSISTENCE_SERVICES_ACKNOWLEDGED',
              timestamp: new Date().toISOString()
            }, '*');
          }
        }
        break;
}
      }
    });
  }
} else {
  console.error("Flashcard app: User is not authenticated");
}
}

// Load user data from Knack
function loadFlashcardUserData(userId, callback) {
  console.log("Flashcard app: Loading user data for:", userId);
  
  // Try to use UnifiedPersistenceManager if available
  if (loadPersistenceServices()) {
    console.log("Flashcard app: Using UnifiedPersistenceManager for loading data");
    
    // Get Auth data from Knack
    const auth = {
      token: Knack.getUserToken(),
      userId: userId,
      email: window.currentKnackUser?.email,
      name: window.currentKnackUser?.name
    };
    
    // Use UnifiedPersistenceManager to load data
    unifiedPersistenceManager.loadUserData(userId, auth)
      .then(userData => {
        console.log("Flashcard app: Successfully loaded user data with UnifiedPersistenceManager");
        callback(userData);
      })
      .catch(error => {
        console.error("Flashcard app: Error loading user data with UnifiedPersistenceManager:", error);
        
        // Instead of falling back, create a new user record if needed
        console.log("Flashcard app: No persistence service or failed to load data, creating empty data");
        
        // Return empty data with a new record if needed
        createFlashcardUserRecord(userId, function(success, recordId) {
          if (success) {
            callback({
              recordId: recordId,
              cards: [],
              colorMapping: {},
              topicLists: [],
              topicMetadata: [],
              spacedRepetition: {
                box1: [],
                box2: [],
                box3: [],
                box4: [],
                box5: []
              }
            });
          } else {
            callback(null);
          }
        });
      });
  } else {
    // Direct API call instead of using legacy method
    console.log("Flashcard app: No persistence manager available, using direct API call");
    
    // Create a function that returns a Promise for the API call
    const apiCall = () => {
      return new Promise((resolve, reject) => {
        $.ajax({
          url: KNACK_API_URL + '/objects/' + FLASHCARD_OBJECT + '/records',
          type: 'GET',
          headers: {
            'X-Knack-Application-Id': knackAppId,
            'X-Knack-REST-API-Key': knackApiKey,
            'Authorization': Knack.getUserToken(),
            'Content-Type': 'application/json'
          },
          data: {
            format: 'raw',
            filters: JSON.stringify({
              match: 'and',
              rules: [
                {
                  field: FIELD_MAPPING.userId,
                  operator: 'is',
                  value: userId
                }
              ]
            })
          },
          success: function(response) {
            resolve(response);
          },
          error: function(error) {
            reject(error);
          }
        });
      });
    };

    // Use our retry mechanism
    retryApiCall(apiCall)
      .then((response) => {
        console.log("Flashcard app: User data search response:", response);
        
        if (response.records && response.records.length > 0) {
          // User has existing data
          const record = response.records[0];
          console.log("Flashcard app: Found existing user data:", record);
          
          // Parse the JSON data
          let userData = {};
          
          try {
            // Parse cards data
            if (record[FIELD_MAPPING.cardBankData]) {
              // Make sure to decode URL-encoded data if needed
              let cardData = record[FIELD_MAPPING.cardBankData];
              if (typeof cardData === 'string' && cardData.includes('%')) {
                cardData = safeDecodeURIComponent(cardData);
              }
              
              // Parse the card data
              let cardArray = safeParseJSON(cardData) || [];
              
              // Migrate legacy type fields to questionType
              cardArray = migrateTypeToQuestionType(cardArray);
              
              // Store migrated cards
              userData.cards = cardArray;
              
              console.log(`Flashcard app: Loaded ${userData.cards.length} cards, including ${userData.cards.filter(c => c.questionType === 'multiple_choice').length} multiple choice cards`);
            } else {
              userData.cards = [];
            }
            
            // Parse color mapping
            if (record[FIELD_MAPPING.colorMapping]) {
              // Make sure to decode URL-encoded data if needed
              let colorData = record[FIELD_MAPPING.colorMapping];
              if (typeof colorData === 'string' && colorData.includes('%')) {
                colorData = safeDecodeURIComponent(colorData);
              }
              userData.colorMapping = safeParseJSON(colorData) || {};
            } else {
              userData.colorMapping = {};
            }
            
            // Parse topic lists data
            if (record[FIELD_MAPPING.topicLists]) {
              // Make sure to decode URL-encoded data if needed
              let topicListData = record[FIELD_MAPPING.topicLists];
              if (typeof topicListData === 'string' && topicListData.includes('%')) {
                topicListData = safeDecodeURIComponent(topicListData);
              }
              userData.topicLists = safeParseJSON(topicListData) || [];
            } else {
              userData.topicLists = [];
            }
            
            // Parse topic metadata
            if (record[FIELD_MAPPING.topicMetadata]) {
              // Make sure to decode URL-encoded data if needed
              let topicMetadata = record[FIELD_MAPPING.topicMetadata];
              if (typeof topicMetadata === 'string' && topicMetadata.includes('%')) {
                topicMetadata = safeDecodeURIComponent(topicMetadata);
              }
              userData.topicMetadata = safeParseJSON(topicMetadata) || [];
            } else {
              userData.topicMetadata = [];
            }
            
            // Parse spaced repetition data
            const srData = {
              box1: [],
              box2: [],
              box3: [],
              box4: [],
              box5: []
            };
            
            // Handle box 1
            if (record[FIELD_MAPPING.box1Data]) {
              let box1Data = record[FIELD_MAPPING.box1Data];
              if (typeof box1Data === 'string' && box1Data.includes('%')) {
                box1Data = safeDecodeURIComponent(box1Data);
              }
              srData.box1 = safeParseJSON(box1Data) || [];
            }
            
            // Handle box 2
            if (record[FIELD_MAPPING.box2Data]) {
              let box2Data = record[FIELD_MAPPING.box2Data];
              if (typeof box2Data === 'string' && box2Data.includes('%')) {
                box2Data = safeDecodeURIComponent(box2Data);
              }
              srData.box2 = safeParseJSON(box2Data) || [];
            }
            
            // Handle box 3
            if (record[FIELD_MAPPING.box3Data]) {
              let box3Data = record[FIELD_MAPPING.box3Data];
              if (typeof box3Data === 'string' && box3Data.includes('%')) {
                box3Data = safeDecodeURIComponent(box3Data);
              }
              srData.box3 = safeParseJSON(box3Data) || [];
            }
            
            // Handle box 4
            if (record[FIELD_MAPPING.box4Data]) {
              let box4Data = record[FIELD_MAPPING.box4Data];
              if (typeof box4Data === 'string' && box4Data.includes('%')) {
                box4Data = safeDecodeURIComponent(box4Data);
              }
              srData.box4 = safeParseJSON(box4Data) || [];
            }
            
            // Handle box 5
            if (record[FIELD_MAPPING.box5Data]) {
              let box5Data = record[FIELD_MAPPING.box5Data];
              if (typeof box5Data === 'string' && box5Data.includes('%')) {
                box5Data = safeDecodeURIComponent(box5Data);
              }
              srData.box5 = safeParseJSON(box5Data) || [];
            }
          
            userData.spacedRepetition = srData;
            
            // Store the record ID for later updates
            userData.recordId = record.id;
            
          } catch (e) {
            console.error("Flashcard app: Error parsing user data:", e);
          }
          
          callback(userData);
        } else {
          // No existing data, create a new record
          console.log("Flashcard app: No existing user data found, creating new record");
          createFlashcardUserRecord(userId, function(success, recordId) {
            if (success) {
              callback({
                recordId: recordId,
                cards: [],
                colorMapping: {},
                topicLists: [],
                topicMetadata: [],
                spacedRepetition: {
                  box1: [],
                  box2: [],
                  box3: [],
                  box4: [],
                  box5: []
                }
              });
            } else {
              callback(null);
            }
          });
        }
      })
      .catch((error) => {
        console.error("Flashcard app: Error loading user data after retries:", error);
        callback(null);
      });
  }
}

// Create a new flashcard user record
function createFlashcardUserRecord(userId, callback) {
console.log("Flashcard app: Creating new flashcard user record for:", userId);

// Get the current user
const user = window.currentKnackUser;

// Prepare the data
const data = {
  [FIELD_MAPPING.userId]: userId,
  [FIELD_MAPPING.userEmail]: sanitizeField(user.email), // Plain text email field
  [FIELD_MAPPING.lastSaved]: new Date().toISOString(),
  [FIELD_MAPPING.cardBankData]: JSON.stringify([]),
  [FIELD_MAPPING.box1Data]: JSON.stringify([]),
  [FIELD_MAPPING.box2Data]: JSON.stringify([]),
  [FIELD_MAPPING.box3Data]: JSON.stringify([]),
  [FIELD_MAPPING.box4Data]: JSON.stringify([]),
  [FIELD_MAPPING.box5Data]: JSON.stringify([]),
  [FIELD_MAPPING.colorMapping]: JSON.stringify({}),
  [FIELD_MAPPING.topicLists]: JSON.stringify([]),
  [FIELD_MAPPING.topicMetadata]: JSON.stringify([]),
  [FIELD_MAPPING.userName]: sanitizeField(user.name || "")
};

// Add non-connection fields
if (user.tutorGroup) data[FIELD_MAPPING.tutorGroup] = sanitizeField(user.tutorGroup);
if (user.yearGroup) data[FIELD_MAPPING.yearGroup] = sanitizeField(user.yearGroup);

// Only add connection fields if they have valid IDs
// Email connection field (field_2956) - only add if it's a valid ID
const emailId = extractValidRecordId(user.id); // User's own ID is used for email connection
if (emailId) {
  data[FIELD_MAPPING.accountConnection] = emailId;
}

// VESPA Customer/school (field_3008) - only add if it's a valid ID 
const schoolId = extractValidRecordId(user.school || user.field_122);
if (schoolId) {
  data[FIELD_MAPPING.vespaCustomer] = schoolId;
}

// Tutor connection (field_3009) - only add if it's a valid ID
const tutorId = extractValidRecordId(user.tutor);
if (tutorId) {
  data[FIELD_MAPPING.tutorConnection] = tutorId;
}

// User Role (field_73) - only add if it's a valid ID
const roleId = extractValidRecordId(user.role);
if (roleId) {
  data[FIELD_MAPPING.userRole] = roleId;
}

// Add debug logging for created record
debugLog("CREATING NEW RECORD", data);

// Create the record
$.ajax({
  url: KNACK_API_URL + '/objects/' + FLASHCARD_OBJECT + '/records',
  type: 'POST',
  headers: {
    'X-Knack-Application-Id': knackAppId,
    'X-Knack-REST-API-Key': knackApiKey,
    'Authorization': Knack.getUserToken(),
    'Content-Type': 'application/json'
  },
  data: JSON.stringify(data),
  success: function(response) {
    console.log("Flashcard app: Successfully created user record:", response);
    callback(true, response.id);
  },
  error: function(error) {
    console.error("Flashcard app: Error creating user record:", error);
    callback(false);
  }
});
}

// Safe check for circular references in data
function ensureDataIsSerializable(obj) {
try {
  // Test if the object can be serialized
  JSON.stringify(obj);
  return obj;
} catch (e) {
  console.error("Flashcard app: Data contains circular references or non-serializable values", e);
  
  // Create a stripped down copy
  const cache = new Set();
  const safeObj = JSON.parse(JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (cache.has(value)) {
        // Circular reference found, discard key
        return '[Circular]';
      }
      cache.add(value);
    }
    return value;
  }));
  
  return safeObj;
}
}

// Standardize card data before saving
function standardizeCards(cards) {
  if (!Array.isArray(cards)) return [];

  return cards.map(card => {
    // Deep clone to avoid modifying original object
    card = JSON.parse(JSON.stringify(card));
    
    // If it's already a standard card, just verify/fix the multiple choice settings
    if (card.createdAt && card.updatedAt && card.examBoard !== undefined) {
      // Detect if this should be a multiple choice card
      const isMultipleChoice = isMultipleChoiceCard(card);
      
      // Correct the questionType fields for multiple choice cards
      if (isMultipleChoice) {
        card.questionType = 'multiple_choice';
        
        // Remove 'type' field if it's used for question format
        if (card.type === 'multiple_choice' || card.type === 'short_answer') {
          delete card.type;
        }
        
        // Restore or create options if missing
        if (!card.options || !Array.isArray(card.options) || card.options.length === 0) {
          // Try to restore from savedOptions first
          if (card.savedOptions && Array.isArray(card.savedOptions) && card.savedOptions.length > 0) {
            console.log(`KnackJavascript4: Restored options from savedOptions for card ${card.id}`);
            card.options = [...card.savedOptions];
          } else {
            // Extract options from answer text as a fallback
            const extractedOptions = extractOptionsFromAnswer(card);
            if (extractedOptions.length > 0) {
              console.log(`KnackJavascript4: Created options from answer text for card ${card.id}`);
              card.options = extractedOptions;
              card.savedOptions = [...extractedOptions];
            }
          }
        }
        
        // Make a backup of options in savedOptions
        if (card.options && Array.isArray(card.options) && card.options.length > 0) {
          card.savedOptions = [...card.options];
        }
      }
      
      return card;
    }

    // Create a standardized version of the card
    let standardCard = {
      id: card.id || `card_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
      subject: card.subject || 'General',
      topic: card.topic || 'General',
      examBoard: card.examBoard || '',
      examType: card.examType || '',
      topicPriority: card.topicPriority || 0,
      question: card.question || card.front || '',
      answer: card.answer || card.back || '',
      keyPoints: card.keyPoints || [],
      detailedAnswer: card.detailedAnswer || '',
      additionalInfo: card.additionalInfo || card.notes || '',
      cardColor: card.cardColor || card.color || '#3cb44b',
      textColor: card.textColor || '',
      boxNum: card.boxNum || 1,
      lastReviewed: card.lastReviewed || null,
      nextReviewDate: card.nextReviewDate || new Date(Date.now() + 86400000).toISOString(),
      createdAt: card.createdAt || new Date().toISOString(),
      updatedAt: card.updatedAt || new Date().toISOString()
    };
    
    // If this is an entity type (e.g., 'topic' or 'card'), preserve it
    if (card.type === 'topic' || card.type === 'card' || card.type === 'shell') {
      standardCard.type = card.type;
    }
    
    // Detect if this should be a multiple choice card
    const isMultipleChoice = isMultipleChoiceCard(standardCard);
    
    // Set appropriate fields for multiple choice cards
    if (isMultipleChoice) {
      standardCard.questionType = 'multiple_choice';
      
      // Use existing options or try to extract them from the answer
      if (card.options && Array.isArray(card.options) && card.options.length > 0) {
        standardCard.options = [...card.options];
        standardCard.savedOptions = [...card.options];
      } else if (card.savedOptions && Array.isArray(card.savedOptions) && card.savedOptions.length > 0) {
        standardCard.options = [...card.savedOptions];
        standardCard.savedOptions = [...card.savedOptions];
      } else {
        // Extract options from answer text
        const extractedOptions = extractOptionsFromAnswer(standardCard);
        if (extractedOptions.length > 0) {
          console.log(`KnackJavascript4: Created options from answer text for new card`);
          standardCard.options = extractedOptions;
          standardCard.savedOptions = [...extractedOptions];
        }
      }
    } else {
      standardCard.questionType = card.questionType || 'short_answer';
    }
    
    return standardCard;
  });
}

// Helper function to detect multiple choice cards
function isMultipleChoiceCard(card) {
  // Case 1: Card has options array
  if (card.options && Array.isArray(card.options) && card.options.length > 0) {
    return true;
  }
  
  // Case 2: Card has savedOptions array
  if (card.savedOptions && Array.isArray(card.savedOptions) && card.savedOptions.length > 0) {
    return true;
  }
  
  // Case 3: Card has questionType explicitly set
  if (card.questionType === 'multiple_choice') {
    return true;
  }
  
  // Case 4: Answer contains "Correct Answer: X)" pattern
  if (card.answer && typeof card.answer === 'string') {
    // Check for "Correct Answer: a)" or "Correct Answer: b)" pattern
    if (card.answer.match(/Correct Answer:\s*[a-z]\)/i)) {
      return true;
    }
    
    // Check for option lettering pattern
    if (card.answer.match(/[a-e]\)\s*[A-Za-z]/)) {
      return true;
    }
  }
  
  // Case 5: Legacy support - card has type set to multiple_choice
  if (card.type === 'multiple_choice') {
    return true;
  }
  
  return false;
}

// Helper function to extract options from answer text
function extractOptionsFromAnswer(card) {
  if (!card.answer || typeof card.answer !== 'string') {
    return [];
  }
  
  // Try to find the correct option letter (a, b, c, d, e)
  const correctAnswerMatch = card.answer.match(/Correct Answer:\s*([a-e])\)/i);
  if (!correctAnswerMatch) {
    return [];
  }
  
  const correctLetter = correctAnswerMatch[1].toLowerCase();
  
  // Create placeholder options based on the correct answer position
  const options = [];
  const letters = ['a', 'b', 'c', 'd', 'e'];
  const correctIndex = letters.indexOf(correctLetter);
  
  if (correctIndex >= 0) {
    // Create 4 options with the correct one marked
    letters.slice(0, 4).forEach(letter => {
      options.push({
        text: letter === correctLetter ? `${card.detailedAnswer || 'Correct option'}` : `Option ${letter.toUpperCase()}`,
        isCorrect: letter === correctLetter
      });
    });
  }
  
  return options;
}

// Add this function near the standardizeCards function
// This is the final check before saving to Knack to ensure multiple choice cards are properly typed
function ensureMultipleChoiceTyping(cards) {
  if (!Array.isArray(cards)) return cards;
  
  console.log(`[${new Date().toISOString()}] Final check: Ensuring multiple choice typing for ${cards.length} cards`);
  let fixedCount = 0;
  
  const result = cards.map(card => {
    // Skip non-card items like topic shells
    if (!card || card.type === 'topic' || card.isShell) {
      return card;
    }
    
    // Deep clone to avoid reference issues
    const fixedCard = JSON.parse(JSON.stringify(card));
    
    // Check for multiple choice pattern in the answer
    if (fixedCard.answer && typeof fixedCard.answer === 'string' && 
        fixedCard.answer.match(/Correct Answer:\s*[a-e]\)/i)) {
      
      // Set questionType to 'multiple_choice'
      if (fixedCard.questionType !== 'multiple_choice') {
        fixedCard.questionType = 'multiple_choice';
        fixedCount++;
      }
      
      // Remove 'type' field if it refers to question format
      if (fixedCard.type === 'multiple_choice' || fixedCard.type === 'short_answer') {
        delete fixedCard.type;
        fixedCount++;
      }
      
      // Extract correct answer and create options if missing
      if (!fixedCard.options || !Array.isArray(fixedCard.options) || fixedCard.options.length === 0) {
        const match = fixedCard.answer.match(/Correct Answer:\s*([a-e])\)/i);
        if (match) {
          const correctLetter = match[1].toLowerCase();
          const letters = ['a', 'b', 'c', 'd', 'e'];
          const options = [];
          
          // Create options with the correct one marked
          letters.slice(0, 4).forEach(letter => {
            options.push({
              text: letter === correctLetter ? 
                  (fixedCard.detailedAnswer || 'Correct option') : 
                  `Option ${letter.toUpperCase()}`,
              isCorrect: letter === correctLetter
            });
          });
          
          fixedCard.options = options;
          fixedCard.savedOptions = [...options];
          console.log(`[${new Date().toISOString()}] Created options for card ${fixedCard.id}`);
        }
      }
    }
    
    // Always check if this is a multiple choice card that needs option preservation
    if (fixedCard.questionType === 'multiple_choice' || fixedCard.type === 'multiple_choice') {
      // Use questionType consistently, remove legacy type fields
      fixedCard.questionType = 'multiple_choice';
      
      // Remove type field if it's for question format
      if (fixedCard.type === 'multiple_choice' || fixedCard.type === 'short_answer') {
        delete fixedCard.type;
      }
      
      // Apply fixes to options if needed
      if (!fixedCard.options || !Array.isArray(fixedCard.options) || fixedCard.options.length === 0) {
        if (fixedCard.savedOptions && Array.isArray(fixedCard.savedOptions) && fixedCard.savedOptions.length > 0) {
          fixedCard.options = [...fixedCard.savedOptions];
          console.log(`[${new Date().toISOString()}] Restored missing options for card ${fixedCard.id}`);
        }
      } else if (!fixedCard.savedOptions || !Array.isArray(fixedCard.savedOptions) || fixedCard.savedOptions.length === 0) {
        fixedCard.savedOptions = [...fixedCard.options];
        console.log(`[${new Date().toISOString()}] Backed up options for card ${fixedCard.id}`);
      }
    }
    
    return fixedCard;
  });
  
  console.log(`[${new Date().toISOString()}] Fixed typing for ${fixedCount} fields in ${cards.filter(c => 
    c && c.answer && typeof c.answer === 'string' && c.answer.match(/Correct Answer:\s*[a-e]\)/i)
  ).length} multiple choice cards`);
  
  return result;
}

// Save flashcard user data
// Handle data saving with field preservation (specifically for topic list updates)
function handlePreserveFieldsDataSave(userId, data, callback) {
  console.log(`Flashcard app [${new Date().toISOString()}]: Saving with field preservation for user:`, userId);
  
  // Ensure we have a record ID
  const recordId = data.recordId;
  if (!recordId) {
    console.error("Flashcard app: Cannot save with field preservation - no record ID");
    callback(false);
    return;
  }
  
  // First, get the current data to perform a proper merge
  getUserDataById(recordId, function(existingData) {
    if (!existingData) {
      console.error(`Flashcard app [${new Date().toISOString()}]: Error getting user data for merging`);
      callback(false);
      return;
    }
    
    // Extract existing topic lists if any
    let existingTopicLists = [];
    if (existingData[FIELD_MAPPING.topicLists]) {
      try {
        let topicListsData = existingData[FIELD_MAPPING.topicLists];
        if (typeof topicListsData === 'string' && topicListsData.includes('%')) {
          topicListsData = safeDecodeURIComponent(topicListsData);
        }
        existingTopicLists = safeParseJSON(topicListsData) || [];
        console.log(`Flashcard app [${new Date().toISOString()}]: Found ${existingTopicLists.length} existing topic lists for merging`);
      } catch (e) {
        console.error(`Flashcard app [${new Date().toISOString()}]: Error parsing existing topic lists:`, e);
        existingTopicLists = [];
      }
    }
    
    // Extract existing topic metadata if any
    let existingMetadata = [];
    if (existingData[FIELD_MAPPING.topicMetadata]) {
      try {
        let metadataData = existingData[FIELD_MAPPING.topicMetadata];
        if (typeof metadataData === 'string' && metadataData.includes('%')) {
          metadataData = safeDecodeURIComponent(metadataData);
        }
        existingMetadata = safeParseJSON(metadataData) || [];
        console.log(`Flashcard app [${new Date().toISOString()}]: Found ${existingMetadata.length} existing topic metadata items for merging`);
      } catch (e) {
        console.error(`Flashcard app [${new Date().toISOString()}]: Error parsing existing topic metadata:`, e);
        existingMetadata = [];
      }
    }
    
    // Get cleaned versions of the new topic data
    const newTopicLists = ensureDataIsSerializable(data.topicLists || []);
    const newTopicMetadata = ensureDataIsSerializable(data.topicMetadata || []);
    
    // Create maps for existing topic lists by subject
    const existingSubjectMap = new Map();
    existingTopicLists.forEach(list => {
      if (list.subject) {
        existingSubjectMap.set(list.subject, list);
      }
    });
    
    // Create maps for existing metadata by ID
    const existingMetadataMap = new Map();
    existingMetadata.forEach(item => {
      if (item.topicId) {
        existingMetadataMap.set(item.topicId, item);
      } else if (item.subject) {
        existingMetadataMap.set(`subject_${item.subject}`, item);
      }
    });
    
    // Merge the topic lists - add new ones and update existing ones
    let mergedTopicLists = [...existingTopicLists]; // Start with existing lists
    
    // Process new topic lists
    newTopicLists.forEach(newList => {
      if (!newList.subject) return; // Skip invalid lists
      
      const existingIndex = mergedTopicLists.findIndex(list => list.subject === newList.subject);
      
      if (existingIndex >= 0) {
        // Update existing list
        mergedTopicLists[existingIndex] = { ...newList };
        console.log(`Flashcard app [${new Date().toISOString()}]: Updated topic list for subject: ${newList.subject}`);
      } else {
        // Add new list
        mergedTopicLists.push({ ...newList });
        console.log(`Flashcard app [${new Date().toISOString()}]: Added new topic list for subject: ${newList.subject}`);
      }
    });
    
    // Merge metadata - add new ones and update existing ones
    let mergedMetadata = [...existingMetadata]; // Start with existing metadata
    
    // Process new metadata
    newTopicMetadata.forEach(newItem => {
      let key = newItem.topicId || (newItem.subject ? `subject_${newItem.subject}` : null);
      if (!key) return; // Skip invalid items
      
      const existingIndex = mergedMetadata.findIndex(item => 
        (item.topicId && item.topicId === newItem.topicId) || 
        (item.subject && item.subject === newItem.subject && !item.topicId)
      );
      
      if (existingIndex >= 0) {
        // Update existing item
        mergedMetadata[existingIndex] = { ...newItem };
      } else {
        // Add new item
        mergedMetadata.push({ ...newItem });
      }
    });
    
    // Create an update object that contains merged data
    const updateData = {
      // Update the following fields
      [FIELD_MAPPING.topicLists]: JSON.stringify(mergedTopicLists),
      [FIELD_MAPPING.topicMetadata]: JSON.stringify(mergedMetadata),
      [FIELD_MAPPING.lastSaved]: new Date().toISOString()
    };
    
    // Log what we're updating
    debugLog("UPDATING WITH MERGED DATA", {
      originalTopicListsCount: existingTopicLists.length,
      newTopicListsCount: newTopicLists.length,
      mergedTopicListsCount: mergedTopicLists.length,
      originalMetadataCount: existingMetadata.length,
      newMetadataCount: newTopicMetadata.length,
      mergedMetadataCount: mergedMetadata.length,
      recordId: recordId,
      timestamp: new Date().toISOString()
    });
    
    // Implement retry mechanism for more reliable saving
    let retryCount = 0;
    const maxRetries = 2;
    
    function attemptSave() {
      // Save to Knack
      $.ajax({
        url: KNACK_API_URL + '/objects/' + FLASHCARD_OBJECT + '/records/' + recordId,
        type: 'PUT',
        headers: {
          'X-Knack-Application-Id': knackAppId,
          'X-Knack-REST-API-Key': knackApiKey,
          'Authorization': Knack.getUserToken(),
          'Content-Type': 'application/json'
        },
        data: JSON.stringify(updateData),
        success: function(response) {
          console.log(`Flashcard app [${new Date().toISOString()}]: Successfully saved topic list data:`, response.id);
          debugLog("SAVE SUCCESS", {
            recordId: response.id,
            timestamp: new Date().toISOString()
          });
          
          // If successful, verify the save immediately
          verifyDataSave(recordId);
          
          // IMPORTANT: Create topic shells immediately when topic lists are saved
          if (mergedTopicLists && mergedTopicLists.length > 0) {
            console.log(`Flashcard app [${new Date().toISOString()}]: Creating topic shells for ${mergedTopicLists.length} topic lists`);
            createTopicShellsFromLists(mergedTopicLists, recordId);
          } else {
            console.log(`Flashcard app [${new Date().toISOString()}]: No topic lists to create shells from`);
          }
          
          callback(true);
        },
        error: function(error) {
          console.error(`Flashcard app [${new Date().toISOString()}]: Error saving topic list data:`, error);
          debugLog("SAVE ERROR", {
            recordId: recordId,
            errorStatus: error.status,
            errorText: error.statusText,
            retryCount: retryCount
          });
          
          // Retry logic for failed saves
          if (retryCount < maxRetries) {
            console.log(`Flashcard app [${new Date().toISOString()}]: Retrying save (${retryCount + 1}/${maxRetries})...`);
            retryCount++;
            // Wait before retrying
            setTimeout(attemptSave, 1000);
          } else {
            callback(false);
          }
        }
      });
    }
    
    // Start the save process
    attemptSave();
  });
}

// Verify that data was saved correctly and fix any issues
function verifyDataSave(recordId) {
  console.log(`Flashcard app [${new Date().toISOString()}]: Verifying data save for record:`, recordId);
  
  // Use SaveVerificationService if available
  if (saveVerificationService) {
    console.log(`Flashcard app [${new Date().toISOString()}]: Using SaveVerificationService for verification`);
    
    saveVerificationService.verifyRecord(recordId)
      .then(result => {
        console.log(`Flashcard app [${new Date().toISOString()}]: Verification completed:`, result);
        
        // If verification detected issues that need fixing
        if (result.needsRepair) {
          console.log(`Flashcard app [${new Date().toISOString()}]: Verification found issues, attempting repair`);
          
          return saveVerificationService.repairRecord(recordId);
        }
      })
      .then(repairResult => {
        if (repairResult) {
          console.log(`Flashcard app [${new Date().toISOString()}]: Repair completed:`, repairResult);
        }
      })
      .catch(error => {
        console.error(`Flashcard app [${new Date().toISOString()}]: Error during verification:`, error);
        
        // Fall back to legacy verification
        legacyVerifyDataSave(recordId);
      });
  } else {
    // Fall back to legacy verification
    legacyVerifyDataSave(recordId);
  }
}

// Original verification function renamed to legacyVerifyDataSave
function legacyVerifyDataSave(recordId) {
  // Wait a moment to ensure data has been committed to the database
  setTimeout(function() {
    // Fetch the record to verify the data is there
    $.ajax({
      url: KNACK_API_URL + '/objects/' + FLASHCARD_OBJECT + '/records/' + recordId,
      type: 'GET',
      headers: {
        'X-Knack-Application-Id': knackAppId,
        'X-Knack-REST-API-Key': knackApiKey,
        'Authorization': Knack.getUserToken(),
        'Content-Type': 'application/json'
      },
      success: function(response) {
        debugLog("VERIFICATION RESULT", {
          recordId: recordId,
          hasTopicLists: response && response[FIELD_MAPPING.topicLists] ? "yes" : "no",
          hasCardBank: response && response[FIELD_MAPPING.cardBankData] ? "yes" : "no",
          timestamp: new Date().toISOString()
        });
        
        // Verify topic lists if present
        if (response && response[FIELD_MAPPING.topicLists]) {
          try {
            const topicListsJson = response[FIELD_MAPPING.topicLists];
            const topicLists = safeParseJSON(topicListsJson);
            
            if (Array.isArray(topicLists) && topicLists.length > 0) {
              console.log(`Flashcard app [${new Date().toISOString()}]: Verification successful: Topic lists present with ${topicLists.length} items`);
              
              // Check if any of the topic lists have topics
              const hasSomeTopics = topicLists.some(list => 
                list.topics && Array.isArray(list.topics) && list.topics.length > 0
              );
              
              if (hasSomeTopics) {
                console.log(`Flashcard app [${new Date().toISOString()}]: Topic lists contain topics - save fully verified`);
                
                // Now check if topic shells were created in the card bank
                if (response && response[FIELD_MAPPING.cardBankData]) {
                  const cardBankJson = response[FIELD_MAPPING.cardBankData];
                  const cardBank = safeParseJSON(cardBankJson);
                  
                  if (Array.isArray(cardBank)) {
                    // Count topic shells and cards
                    const topicShells = cardBank.filter(item => item.type === 'topic');
                    const cards = cardBank.filter(item => item.type !== 'topic');
                    
                    console.log(`Flashcard app [${new Date().toISOString()}]: Card bank contains ${topicShells.length} topic shells and ${cards.length} cards`);
                    
                    // Check if we need to create topic shells
                    if (topicShells.length === 0 && hasSomeTopics) {
                      console.warn(`Flashcard app [${new Date().toISOString()}]: No topic shells found in card bank but topic lists exist - creating topic shells`);
                      
                      // Create topic shells from topic lists
                      createTopicShellsFromLists(topicLists, recordId);
                    }
                    
                    // Check if cards are properly associated with topic shells
                    const cardsWithTopicIds = cards.filter(card => card.topicId);
                    console.log(`Flashcard app [${new Date().toISOString()}]: ${cardsWithTopicIds.length} of ${cards.length} cards have topicId references`);
                  }
                }
              } else {
                console.warn(`Flashcard app [${new Date().toISOString()}]: Topic lists exist but none have topics`);
              }
            } else {
              console.error(`Flashcard app [${new Date().toISOString()}]: Verification failed: Topic lists empty or malformed`);
            }
          } catch (e) {
            console.error(`Flashcard app [${new Date().toISOString()}]: Error parsing topic lists during verification:`, e);
          }
        } else {
          console.warn(`Flashcard app [${new Date().toISOString()}]: No topic lists field found during verification`);
        }
      },
      error: function(error) {
        console.error(`Flashcard app [${new Date().toISOString()}]: Verification error:`, error);
      }
    });
  }, 2000); // Wait 2 seconds before verification
}

/**
 * Create topic shells from topic lists and save them to the card bank
 * @param {Array} topicLists - Array of topic lists
 * @param {string} recordId - Record ID
 */
function createTopicShellsFromLists(topicLists, recordId) {
  try {
    if (!Array.isArray(topicLists) || topicLists.length === 0) {
      console.log(`Flashcard app [${new Date().toISOString()}]: No topic lists to create shells from`);
      return;
    }
    
    // Try to use CardTopicRelationshipManager if available
    if (cardTopicRelationshipManager) {
      console.log(`Flashcard app [${new Date().toISOString()}]: Using CardTopicRelationshipManager for creating topic shells`);
      
      // Extract topics from topic lists
      const topics = [];
      topicLists.forEach(list => {
        if (list.topics && Array.isArray(list.topics)) {
          list.topics.forEach(topic => {
            topics.push({
              id: topic.id || `topic_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
              name: topic.name || topic.topic || "Unknown Topic",
              subject: list.subject || "General",
              examBoard: list.examBoard || "General",
              examType: list.examType || "Course",
              color: topic.color
            });
          });
        }
      });
      
      // Create topic shells
      cardTopicRelationshipManager.createTopicShells(topics, recordId)
        .then(result => {
          console.log(`Flashcard app [${new Date().toISOString()}]: Successfully created ${result.count} topic shells with CardTopicRelationshipManager`);
          
          // Notify the React app
          const iframe = document.getElementById('flashcard-app-iframe');
          if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
              type: 'TOPIC_SHELLS_CREATED',
              timestamp: new Date().toISOString(),
              count: result.count,
              shouldReload: true
            }, '*');
          }
        })
        .catch(error => {
          console.error(`Flashcard app [${new Date().toISOString()}]: Error creating topic shells with CardTopicRelationshipManager:`, error);
          
          // Fall back to direct API approach
          console.log(`Flashcard app [${new Date().toISOString()}]: Using direct API approach for creating topic shells`);
          createTopicShellsDirectAPI(topicLists, recordId);
        });
    } else {
      // Use direct API approach
      console.log(`Flashcard app [${new Date().toISOString()}]: No CardTopicRelationshipManager, using direct API approach`);
      createTopicShellsDirectAPI(topicLists, recordId);
    }
  } catch (error) {
    console.error(`Flashcard app [${new Date().toISOString()}]: Error in createTopicShellsFromLists:`, error);
    
    // Use direct API approach for error recovery
    createTopicShellsDirectAPI(topicLists, recordId);
  }
}

// In KnackJavascript4j.js, add this function:

function handleTokenRefresh() {
  console.log("Handling token refresh request from React app");
  
  try {
    // Get a fresh token from Knack
    const currentToken = Knack.getUserToken();
    
    // Check if token is available
    if (!currentToken) {
      console.error("Cannot get token from Knack");
      
      // Send failure response to React app
      iframe.contentWindow.postMessage({
        type: "AUTH_REFRESH_RESULT",
        success: false,
        error: "Token not available from Knack"
      }, "*");
      
      return;
    }
    
    // Try to re-authenticate with Knack
    Knack.getUserAuthToken(function(freshToken) {
      if (freshToken) {
        // Send successful response to React app
        iframe.contentWindow.postMessage({
          type: "AUTH_REFRESH_RESULT",
          success: true,
          token: freshToken
        }, "*");
        
        console.log("Successfully refreshed token");
      } else {
        // Send failure response to React app
        iframe.contentWindow.postMessage({
          type: "AUTH_REFRESH_RESULT",
          success: false,
          error: "Failed to get fresh token from Knack"
        }, "*");
        
        console.error("Failed to get fresh token from Knack");
      }
    });
  } catch (error) {
    console.error("Error refreshing token:", error);
    
    // Send failure response to React app
    iframe.contentWindow.postMessage({
      type: "AUTH_REFRESH_RESULT",
      success: false,
      error: error.message || "Unknown error refreshing token"
    }, "*");
  }
}

// Modify the handleAddToBank function to return a Promise
function handleAddToBankPromise(data) {
  return new Promise((resolve, reject) => {
    handleAddToBank(data, (success) => {
      if (success) {
        resolve(success);
      } else {
        reject(new Error("Failed to add to bank"));
      }
    });
  });
}

// Function to notify the React app about save status
function notifySaveStatus(status, recordId) {
  const iframe = document.getElementById('flashcard-app-iframe');
  if (iframe && iframe.contentWindow) {
    iframe.contentWindow.postMessage({
      type: 'SAVE_STATUS',
      status: status, // 'started', 'completed', 'failed'
      recordId: recordId,
      timestamp: new Date().toISOString()
    }, '*');
  }
}

// Import our persistence services
let unifiedPersistenceManager, topicShellManager, metadataManager, colorManager, dataOperationQueue;

// Function to load the persistence services
function loadPersistenceServices() {
  try {
    // Check if services are already available in window object (set by React app)
    if (window.unifiedPersistenceManager) {
      unifiedPersistenceManager = window.unifiedPersistenceManager;
      console.log("Flashcard app: Using UnifiedPersistenceManager from window object");
    }
    
    if (window.topicShellManager) {
      topicShellManager = window.topicShellManager;
    }
    
    if (window.metadataManager) {
      metadataManager = window.metadataManager;
    }
    
    if (window.colorManager) {
      colorManager = window.colorManager;
    }
    
    if (window.dataOperationQueue) {
      dataOperationQueue = window.dataOperationQueue;
    }
    
    // Return true if the main service is available
    return !!unifiedPersistenceManager;
  } catch (error) {
    console.error("Flashcard app: Error loading persistence services:", error);
    return false;
  }
}

// In your React app, after initializing the persistence services
if (window.parent) {
  window.parent.postMessage({
    type: 'PERSISTENCE_SERVICES_READY',
    services: {
      unifiedPersistenceManager,
      topicShellManager,
      metadataManager, 
      colorManager,
      dataOperationQueue
    }
  }, '*');
}

// Import services (add these variables at the top level)
let saveQueueManager, cardTopicRelationshipManager, messageHandler, saveVerificationService;

// Function to load the new services
function loadServices() {
  try {
    // Try to dynamically import the services
    import('/src/services/SaveQueueManager.js')
      .then(module => {
        saveQueueManager = module.default;
        console.log("Flashcard app: SaveQueueManager loaded successfully");
      })
      .catch(error => {
        console.error("Flashcard app: Error loading SaveQueueManager:", error);
      });
    
    import('/src/services/CardTopicRelationshipManager.js')
      .then(module => {
        cardTopicRelationshipManager = module.default;
        console.log("Flashcard app: CardTopicRelationshipManager loaded successfully");
      })
      .catch(error => {
        console.error("Flashcard app: Error loading CardTopicRelationshipManager:", error);
      });
    
    import('/src/services/MessageHandler.js')
      .then(module => {
        messageHandler = module.default;
        console.log("Flashcard app: MessageHandler loaded successfully");
        
        // Initialize with SaveQueueManager if available
        if (saveQueueManager) {
          messageHandler.setSaveQueueManager(saveQueueManager);
        }
      })
      .catch(error => {
        console.error("Flashcard app: Error loading MessageHandler:", error);
      });
      
    import('/src/services/SaveVerificationService.js')
      .then(module => {
        saveVerificationService = module.default;
        console.log("Flashcard app: SaveVerificationService loaded successfully");
      })
      .catch(error => {
        console.error("Flashcard app: Error loading SaveVerificationService:", error);
      });
      
    return true;
  } catch (error) {
    console.error("Flashcard app: Error loading services:", error);
    return false;
  }
}

// Call loadServices immediately
loadServices();

// Improve the handleSaveData function to use SaveQueueManager
let saveInProgress = false;
let saveQueued = false;

function handleSaveData(data) {
  // Try to use SaveQueueManager if available
  if (saveQueueManager) {
    console.log("Using SaveQueueManager for saving data");
    
    return new Promise((resolve, reject) => {
      // Prevent multiple save operations
      if (saveInProgress) {
        saveQueued = true;
        console.log("Save already in progress, queueing this save");
        
        resolve({ queued: true });
        return;
      }
      
      saveInProgress = true;
      
      // Begin a transaction
      const transactionId = saveQueueManager.beginTransaction();
      
      // Add operations based on data content
      if (data.cards && Array.isArray(data.cards)) {
        saveQueueManager.addOperation({
          type: 'saveCards',
          cards: data.cards
        });
      }
      
      if (data.topicLists && Array.isArray(data.topicLists)) {
        saveQueueManager.addOperation({
          type: 'saveTopicLists',
          topicLists: data.topicLists
        });
      }
      
      if (data.topicMetadata && Array.isArray(data.topicMetadata)) {
        saveQueueManager.addOperation({
          type: 'saveTopicMetadata',
          topicMetadata: data.topicMetadata
        });
      }
      
      if (data.colorMapping) {
        saveQueueManager.addOperation({
          type: 'updateColorMapping',
          colorMapping: data.colorMapping
        });
      }
      
      // Add user data for context
      if (window.currentKnackUser) {
        saveQueueManager.addOperation({
          type: 'addUserContext',
          user: window.currentKnackUser
        });
      }
      
      // Commit the transaction
      saveQueueManager.commitTransaction()
        .then(() => {
          console.log("Save transaction committed successfully");
          saveInProgress = false;
          
          // Process any queued saves
          if (saveQueued) {
            saveQueued = false;
            console.log("Processing queued save");
            setTimeout(() => {
              handleSaveData(data);
            }, 500);
          }
          
          resolve(true);
        })
        .catch(error => {
          console.error("Save transaction failed:", error);
          saveInProgress = false;
          reject(error);
        });
    });
  } else {
    // Legacy save path using direct API
    console.log("SaveQueueManager not available, using direct API");
    
    return new Promise((resolve, reject) => {
      // Prevent multiple save operations
      if (saveInProgress) {
        saveQueued = true;
        console.log("Save already in progress, queueing this save");
        
        resolve({ queued: true });
        return;
      }
      
      saveInProgress = true;
      
      const userId = window.currentKnackUser?.id;
      
      if (!userId) {
        console.error("Cannot save - missing user ID");
        saveInProgress = false;
        reject(new Error("Missing user ID"));
        return;
      }
      
      // Handle different save types
      const saveFunction = data.preserveFields === true ? 
        handlePreserveFieldsDataSave : saveFlashcardUserData;
      
      saveFunction(userId, data, (success) => {
        saveInProgress = false;
        
        if (success) {
          // Process any queued saves
          if (saveQueued) {
            saveQueued = false;
            console.log("Processing queued save");
            setTimeout(() => {
              handleSaveData(data);
            }, 500);
          }
          
          resolve(true);
        } else {
          reject(new Error("Save failed"));
        }
      });
    });
  }
}
