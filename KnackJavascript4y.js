// knack-integration.js - Safe for public GitHub repository
(function() {
  // Global variables
  var saveQueueManager, cardTopicRelationshipManager, messageHandler, saveVerificationService;
  var unifiedPersistenceManager, topicShellManager, metadataManager, colorManager, dataOperationQueue;
  var saveInProgress = false;
  var saveQueued = false;
  var appReadyHandled = false; // Added to track if APP_READY has been handled
  var authSent = false; // Added to track if auth info has been sent
  
  // Initialize Flashcard App
  function initializeFlashcardApp(view) {
    console.log("Initializing Flashcard React app for view:", view.key);
    
    // --- Reverted: Find container and dynamically create iframe --- 
    var container = $(view.knackView.el).find('.kn-rich-text')[0]; 
    var iframe = null; // Initialize iframe as null
    var loadingDiv = document.getElementById('loading-indicator'); // Assuming this ID exists separately
    
    if (!container) {
        console.error(`Flashcard app: Could not find container element ('.kn-rich-text') within view ${view.key}. Cannot create iframe.`);
        if (loadingDiv) loadingDiv.textContent = 'Error: App container not found.'; // Update loading indicator
        return; // Stop initialization
    }

    // Dynamically create the iframe
    iframe = document.createElement('iframe');
    iframe.id = 'flashcard-app-iframe'; // Assign the ID we look for later
    iframe.style.width = '100%';
    iframe.style.height = '80vh'; // Adjust height as needed
    iframe.style.border = 'none';
    iframe.style.display = 'none'; // Hide initially
    iframe.title = "Flashcard Application"; // Accessibility
    
    // Get the App URL from config (assuming VESPA_CONFIG is available)
    const appUrl = (window.VESPA_CONFIG && window.VESPA_CONFIG.appUrl)
                   ? window.VESPA_CONFIG.appUrl 
                   : 'https://vespa-flashcards-e7f31e9ff3c9.herokuapp.com/'; // Fallback URL
    iframe.src = appUrl;

    // Append the created iframe to the container
    container.appendChild(iframe);
    console.log("Flashcard app: Dynamically created and appended iframe.");
    // --- End iframe creation logic ---

    // Get other necessary Knack details
    var userToken = Knack.getUserToken(); // Get token
    var appId = Knack.app.id; // Get app ID
    var currentUser = Knack.getUserAttributes(); // Get user attributes

    // Try to load persistence services exposed by React app first
    loadPersistenceServices(); // Check if services are already on window
    
    // Check if user is authenticated
    if (Knack && userToken) { // Use the fetched token
      var user = currentUser; // Use the fetched attributes
      window.currentKnackUser = user;
      
      // Set up message listener
      window.addEventListener('message', function(event) {
        // Ignore messages from other sources
        if (!iframe || !iframe.contentWindow || event.source !== iframe.contentWindow) {
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
              
              // First, get user data from Knack
              loadFlashcardUserData(user.id, function(userData) {
                // Rest of the existing APP_READY handler...
                // Keep this code intact
                
                // Check again to prevent double-handling due to async operations
                if (authSent) {
                  console.log("Flashcard app: Auth already sent, skipping duplicate send");
                  return;
                }
                
                // --- Ensure currentUser is defined before accessing its properties ---
                if (!currentUser) {
                  console.error("Flashcard app: currentUser attributes not available for sending.");
                  // Handle error appropriately - maybe try fetching again or show error
                  return; 
                }
                // --- End Check ---
                
                // Include connection field IDs in the data sent to the React app
                const userDataToSend = {
                  id: user.id,
                  email: user.email,
                  name: user.name || '',
                  token: userToken, // Use token variable
                  appId: appId, // Use appId variable
                  userData: userData || {},
                  // Add connection field IDs - Use correct fields from KnackJavascript4q.js
                  emailId: extractValidRecordId(currentUser.id), // User's own ID for email connection
                  schoolId: extractValidRecordId(currentUser.school || currentUser.field_122), // Use user.school or field_122
                  tutorId: extractValidRecordId(currentUser.tutor), // Use user.tutor
                  roleId: extractValidRecordId(currentUser.role) // Use user.role
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
              if (loadingDiv) loadingDiv.style.display = 'none';
              if (iframe) iframe.style.display = 'block';
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
                    if (iframe && iframe.contentWindow) {
                       iframe.contentWindow.postMessage({
                        type: 'REQUEST_UPDATED_DATA',
                        recordId: recordId, // Ensure recordId is defined in this scope
                        timestamp: new Date().toISOString()
                      }, '*');
                    } else {
                       console.error("Flashcard app: Cannot request updated data, iframe not available.");
                    }
                    
                    // Reset flag
                    window.addToBankInProgress = false;
                  }, 2000);
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
                  // Add a check to prevent reload loops if initialization failed
                  if (iframe) { // Only reload if iframe was found initially
                     window.location.reload();
                  }
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
                      // Add a check to prevent reload loops if initialization failed
                      if (iframe) { // Only reload if iframe was found initially
                         window.location.reload();
                      }
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
                // --- Ensure handleAddToBank is defined (it's currently a stub) ---
                handleAddToBank(event.data, function(success) {
                  // We don't need to notify about this automatic operation
                  if (!success) {
                     console.error("Flashcard app: Auto-triggered AddToBank failed.");
                  }
                });
                 // --- End Check ---
              }
              break;
              
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
                    if (iframe && iframe.contentWindow) {
                      iframe.contentWindow.postMessage({
                        type: 'DATA_REFRESH_ERROR',
                        error: 'Failed to load data for reload'
                      }, '*');
                    } else {
                       console.error("Flashcard app: Cannot send DATA_REFRESH_ERROR (failed load), iframe not available.");
                    }
                  }
                });
              } else {
                // If we can't communicate with the iframe, fall back to a full page reload
                console.log(`Flashcard app [${new Date().toISOString()}]: No iframe to communicate with, falling back to full page reload`);
                window.location.reload();
              }
              break;
              
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
                  } else {
                     console.error("Flashcard app: Cannot send AUTH_REFRESH, iframe not available.");
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
              
            case 'REQUEST_TOKEN_REFRESH':
              handleTokenRefresh();
              break;
                      
            case 'REQUEST_UPDATED_DATA':
              console.log(`Flashcard app [${new Date().toISOString()}]: Requested updated data`);
              
              // Get the record ID from the message or use the current user
              const dataUserId = user.id;
              const dataRecordId = event.data.recordId;
              
              if (!dataRecordId) {
                console.error("Flashcard app: Cannot refresh data - missing record ID");
                if (iframe && iframe.contentWindow) {
                  iframe.contentWindow.postMessage({
                    type: 'DATA_REFRESH_ERROR',
                    error: 'Missing record ID'
                  }, '*');
                } else {
                   console.error("Flashcard app: Cannot send DATA_REFRESH_ERROR (missing record ID), iframe not available.");
                }
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
                  if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.postMessage({
                      type: 'DATA_REFRESH_ERROR',
                      error: 'Failed to load data'
                    }, '*');
                  } else {
                     console.error("Flashcard app: Cannot send DATA_REFRESH_ERROR (failed load), iframe not available.");
                  }
                }
              });
              break;
              
            case 'REQUEST_RECORD_ID':
              console.log(`Flashcard app [${new Date().toISOString()}]: Record ID requested from React app`);
              
              // Get the user's record ID
              const currentUserId = user.id;
              
              // Look up the record ID for this user
              loadFlashcardUserData(currentUserId, function(userData) {
                if (userData && userData.recordId) {
                  console.log(`Flashcard app [${new Date().toISOString()}]: Found record ID for user: ${userData.recordId}`);
                  
                  // Send the record ID back to the React app
                  if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.postMessage({
                      type: 'RECORD_ID_RESPONSE',
                      recordId: userData.recordId,
                      timestamp: new Date().toISOString()
                    }, '*');
                  } else {
                     console.error("Flashcard app: Cannot send RECORD_ID_RESPONSE, iframe not available.");
                  }
                } else {
                  console.error(`Flashcard app [${new Date().toISOString()}]: Could not find record ID for user ${currentUserId}`);
                  
                  // Send an error response
                  if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.postMessage({
                      type: 'RECORD_ID_ERROR',
                      error: 'Record ID not found',
                      timestamp: new Date().toISOString()
                    }, '*');
                  } else {
                     console.error("Flashcard app: Cannot send RECORD_ID_ERROR, iframe not available.");
                  }
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
                  if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.postMessage({
                      type: 'PERSISTENCE_SERVICES_ACKNOWLEDGED',
                      timestamp: new Date().toISOString()
                    }, '*');
                  } else {
                     console.error("Flashcard app: Cannot send PERSISTENCE_SERVICES_ACKNOWLEDGED, iframe not available.");
                  }
                }
              }
              break;
          }
        }
      });
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
        console.log("Flashcard app: Using TopicShellManager from window object"); // Added log
      }
      
      if (window.metadataManager) {
        metadataManager = window.metadataManager;
         console.log("Flashcard app: Using MetadataManager from window object"); // Added log
      }
      
      if (window.colorManager) {
        colorManager = window.colorManager;
         console.log("Flashcard app: Using ColorManager from window object"); // Added log
      }
      
      if (window.dataOperationQueue) {
        dataOperationQueue = window.dataOperationQueue;
         console.log("Flashcard app: Using DataOperationQueue from window object"); // Added log
      }
      
      // Return true if the main service is available
      return !!unifiedPersistenceManager;
    } catch (error) {
      console.error("Flashcard app: Error loading persistence services:", error);
      return false;
    }
  }

  // Improve the handleSaveData function to use SaveQueueManager or fall back
  function handleSaveData(data) {
      // Check if persistence services are loaded (preferred method)
      if (loadPersistenceServices() && unifiedPersistenceManager) {
          console.log("Using UnifiedPersistenceManager for saving data");

          return new Promise((resolve, reject) => {
              if (saveInProgress) {
                  saveQueued = true;
                  console.log("Save already in progress, queueing this save");
                  resolve({ queued: true });
                  return;
              }
              saveInProgress = true;
              notifySaveStatus('started', data.recordId); // Notify start

              // Get Auth data from Knack
              const auth = {
                  token: Knack.getUserToken(),
                  userId: window.currentKnackUser?.id,
                  email: window.currentKnackUser?.email,
                  name: window.currentKnackUser?.name
              };

              unifiedPersistenceManager.saveUserData(data, auth, data.preserveFields)
                  .then(() => {
                      console.log("UnifiedPersistenceManager save completed successfully");
                      notifySaveStatus('completed', data.recordId); // Notify completion
                      saveInProgress = false;
                      if (saveQueued) {
                          saveQueued = false;
                          console.log("Processing queued save");
                          // Re-trigger the save logic. Use a small delay if needed.
                          setTimeout(() => handleSaveData(data), 100);
                      }
                      resolve(true);
                  })
                  .catch(error => {
                      console.error("UnifiedPersistenceManager save failed:", error);
                      notifySaveStatus('failed', data.recordId); // Notify failure
                      saveInProgress = false;
                      reject(error);
                  });
          });
      } else {
          // Fallback to direct API calls (using STUBBED functions for now)
          console.warn("Persistence services not available, falling back to direct API (using stubs)");

          return new Promise((resolve, reject) => {
              if (saveInProgress) {
                  saveQueued = true;
                  console.log("Save already in progress (fallback), queueing this save");
                  resolve({ queued: true });
                  return;
              }
              saveInProgress = true;
              notifySaveStatus('started', data.recordId); // Notify start

              const userId = window.currentKnackUser?.id;
              if (!userId) {
                  console.error("Cannot save (fallback) - missing user ID");
                  saveInProgress = false;
                  notifySaveStatus('failed', data.recordId); // Notify failure
                  reject(new Error("Missing user ID"));
                  return;
              }

              // Choose the correct (stubbed) save function based on preserveFields
              const saveFunction = data.preserveFields === true ?
                  handlePreserveFieldsDataSave : saveUserDataDirectAPI; // Use direct API stub

              // --- Added: Ensure saveFunction is actually a function before calling ---
              if (typeof saveFunction !== 'function') {
                  console.error("Fallback save error: saveFunction is not defined or not a function.", { preserveFields: data.preserveFields });
                  saveInProgress = false;
                  notifySaveStatus('failed', data.recordId);
                  reject(new Error("Internal configuration error: Save function not found."));
                  return;
              }
              // --- End Check ---

              // Execute the stubbed function
              saveFunction(userId, data, (success) => { // Assuming stubbed functions take a callback
                  saveInProgress = false;
                  if (success) {
                      notifySaveStatus('completed', data.recordId); // Notify completion
                      console.log("Fallback save reported success (from stub/callback)");
                      if (saveQueued) {
                          saveQueued = false;
                          console.log("Processing queued save (fallback)");
                          setTimeout(() => handleSaveData(data), 100);
                      }
                      resolve(true);
                  } else {
                      notifySaveStatus('failed', data.recordId); // Notify failure
                      console.error("Fallback save reported failure (from stub/callback)");
                      reject(new Error("Fallback save failed"));
                  }
              }).catch(error => { // Also handle promise rejection from stubs
                 saveInProgress = false;
                 notifySaveStatus('failed', data.recordId);
                 console.error("Fallback save failed (promise rejection from stub):", error);
                 reject(error);
              });
          });
      }
  }

  // Function to notify the React app about save status
  function notifySaveStatus(status, recordId) {
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'SAVE_STATUS',
        status: status, // 'started', 'completed', 'failed'
        recordId: recordId,
        timestamp: new Date().toISOString()
      }, '*');
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

  function handleTokenRefresh() {
    console.log("Handling token refresh request from React app");
    
    try {
      // Get a fresh token from Knack
      const currentToken = Knack.getUserToken();
      
      // Check if token is available
      if (!currentToken) {
        console.error("Cannot get token from Knack");
        
        // Send failure response to React app
        if (iframe && iframe.contentWindow) {
            iframe.contentWindow.postMessage({
              type: "AUTH_REFRESH_RESULT",
              success: false,
              error: "Token not available from Knack"
            }, "*");
        } else {
            console.error("Cannot send AUTH_REFRESH_RESULT (token fail), iframe not available.");
        }
        
        return;
      }
      
      // Try to re-authenticate with Knack
      Knack.getUserAuthToken(function(freshToken) {
        if (freshToken) {
          // Send successful response to React app
          if (iframe && iframe.contentWindow) {
              iframe.contentWindow.postMessage({
                type: "AUTH_REFRESH_RESULT",
                success: true,
                token: freshToken
              }, "*");
          } else {
              console.error("Cannot send AUTH_REFRESH_RESULT (success), iframe not available.");
          }
          
          console.log("Successfully refreshed token");
        } else {
          // Send failure response to React app
          if (iframe && iframe.contentWindow) {
              iframe.contentWindow.postMessage({
                type: "AUTH_REFRESH_RESULT",
                success: false,
                error: "Failed to get fresh token from Knack"
              }, "*");
          } else {
              console.error("Cannot send AUTH_REFRESH_RESULT (Knack fail), iframe not available.");
          }
          
          console.error("Failed to get fresh token from Knack");
        }
      });
    } catch (error) {
      console.error("Error refreshing token:", error);
      
      // Send failure response to React app
      if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage({
            type: "AUTH_REFRESH_RESULT",
            success: false,
            error: error.message || "Unknown error refreshing token"
          }, "*");
      } else {
          console.error("Cannot send AUTH_REFRESH_RESULT (catch block), iframe not available.");
      }
    }
  }

  // --- Need createTopicShellsFromLists or its equivalent ---
  // Placeholder stub for createTopicShellsFromLists
  function createTopicShellsFromLists(topicLists, recordId) {
      console.warn("createTopicShellsFromLists is not fully implemented in KnackJavascript4s.js");
      // Check if topicShellManager is available from React app
      if (loadPersistenceServices() && topicShellManager) {
          console.log("Attempting to use TopicShellManager to create shells...");
           // Get Auth data from Knack
          const auth = {
              token: Knack.getUserToken(),
              userId: window.currentKnackUser?.id,
              email: window.currentKnackUser?.email,
              name: window.currentKnackUser?.name
          };
          // Assuming topicShellManager has a method like createShells
          // Adjust method name and parameters as needed based on React app's implementation
          topicShellManager.createShells(topicLists, recordId, auth)
              .then(() => {
                  console.log("TopicShellManager successfully processed shells.");
                  // Consider if reload is still needed or if React app handles UI updates
                  // setTimeout(() => { window.location.reload(); }, 2000);
              })
              .catch(error => {
                  console.error("Error using TopicShellManager:", error);
                  // Fallback or error handling needed here
              });
      } else {
          console.error("Cannot create topic shells: TopicShellManager not available and fallback not implemented.");
          // If a direct API fallback is needed, implement createTopicShellsDirectAPI here.
          // createTopicShellsDirectAPI(topicLists, recordId); // <-- Need this function from 4q.js if fallback is required
      }
  }

  // Placeholder stub for createTopicShellsDirectAPI (if needed as fallback)
  function createTopicShellsDirectAPI(topicLists, recordId) {
      console.error("Error: createTopicShellsDirectAPI is not implemented in this file.", { topicLists, recordId });
      // Add implementation from KnackJavascript4q.js if direct API calls are necessary as a fallback
  }
  // --- End Topic Shells section ---

  // --- ADDED: Knack specific view render listener ---
  $(document).on('knack-view-render.view_3005', function(event, view) {
    console.log("Knack view view_3005 rendered, initializing flashcard app.");
    // Pass the specific view object to the initialization function
    initializeFlashcardApp(view);
  });
  // --- END Knack listener ---

})();
