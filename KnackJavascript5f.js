// knack-integration.js - Safe for public GitHub repository
(function() {
  // --- Reinstated Knack API Configuration (from KnackJavascript4q.js & logs) ---
  // Check for configuration in global scope
  if (!window.VESPA_CONFIG) {
    console.error("Flashcard app: Missing VESPA_CONFIG. Please define configuration in Knack.");
    return; // Stop if config is missing
  }
  const knackAppId = window.VESPA_CONFIG.knackAppId;
  const knackApiKey = window.VESPA_CONFIG.knackApiKey;
  const KNACK_API_URL = 'https://api.knack.com/v1'; // Standard Knack API URL
  const FLASHCARD_OBJECT = 'object_102'; // Assuming object_102 based on previous files/q version
  // Field mapping (Essential for API calls - verify these match your Knack object)
  const FIELD_MAPPING = {
    userId: 'field_2954',           // User ID (Verify - q had 2954, s had 2955)
    userEmail: 'field_2958',        // User email (Verify - q had 2958, s had 123)
    accountConnection: 'field_2956', // Connection to account (Verify - q had 2956, s had 2956)
    vespaCustomer: 'field_3008',    // VESPA Customer Connection (Verify - q had 3008, s had 3008)
    tutorConnection: 'field_3009',  // Tutor Connection (Verify - q had 3009, s had 3009)
    cardBankData: 'field_2979',     // Flashcard Bank JSON Store (Verify - q had 2979, s had 2958)
    lastSaved: 'field_2957',        // Date Last Saved (Verify - q had 2957, s had 2957)
    box1Data: 'field_2986',         // Box 1 JSON (Verify - q had 2986, s had 2959)
    box2Data: 'field_2987',         // Box 2 JSON (Verify - q had 2987, s had 2960)
    box3Data: 'field_2988',         // Box 3 JSON (Verify - q had 2988, s had 2961)
    box4Data: 'field_2989',         // Box 4 JSON (Verify - q had 2989, s had 2962)
    box5Data: 'field_2990',         // Box 5 JSON (Verify - q had 2990, s had 2963)
    colorMapping: 'field_3000',     // Color Mapping (Verify - q had 3000, s had 3010)
    topicLists: 'field_3011',       // Topic Lists JSON (Verify - q had 3011, s had 3011)
    topicMetadata: 'field_3030',    // Topic Metadata JSON (Verify - q had 3030, s had 3030)
    userName: 'field_3010',         // User Name (Verify - q had 3010, s had 119)
    // Fields from q version not in s version (Add if needed)
    tutorGroup: 'field_565',        // Tutor Group
    yearGroup: 'field_548',         // Year Group
    userRole: 'field_73'            // User Role (Verify - q had 73, s had 73)
  };
  // --- End Knack API Configuration ---

  // Global variables for services - To be loaded from iframe window
  var saveQueueManager, cardTopicRelationshipManager, messageHandler, saveVerificationService;
  // Also keep references for older service names if React app uses them
  var unifiedPersistenceManager, topicShellManager, metadataManager, colorManager, dataOperationQueue;

  // Flags
  var servicesReady = false; // Track if services are loaded from iframe
  var appReadyHandled = false; // Track if APP_READY message was handled
  var authSent = false;      // Track if auth info has been sent
  var authConfirmReceived = false; // Track if React app confirmed auth

  // --- Helper Functions (Mostly from KnackJavascript4s.js, verified essential ones) ---

  // Safely decode URI components
  function safeDecodeURIComponent(str) {
    if (!str) return str;
    try {
      // First, try replacing lone % symbols that are not part of a valid escape sequence
      // This regex looks for a % not followed by two hex characters (0-9, A-F, a-f)
      // It uses a negative lookahead assertion
      const cleanedStr = str.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
      return decodeURIComponent(cleanedStr);
    } catch (e) {
      console.error("Error decoding URI component:", e, "String:", str);
      // If it still fails, return the original string
      return str;
    }
  }


  // Safely parse JSON
  function safeParseJSON(jsonString) {
     if (!jsonString) return null; // Handle null/undefined/empty string early
     // If it's already an object, just return it (common case if already parsed)
     if (typeof jsonString === 'object') return jsonString;
     // Ensure it's a string before proceeding
     if (typeof jsonString !== 'string') {
         console.warn("safeParseJSON received non-string input:", jsonString);
         return null;
     }
     try {
       // Decode first if necessary
       if (jsonString.includes('%')) {
          jsonString = safeDecodeURIComponent(jsonString);
       }
       // Trim whitespace which can cause issues
       return JSON.parse(jsonString.trim());
     } catch (e) {
       // Log the initial error
       console.warn("Initial JSON parse failed:", e.message);
       // Attempt common fixes
       try {
           let fixedString = jsonString.trim();
           // Remove trailing commas before closing brackets/braces
           fixedString = fixedString.replace(/,\s*([\]}])/g, '$1');
           // Attempt to fix improperly escaped quotes (simple cases)
           // This needs careful consideration depending on the data source
           // fixedString = fixedString.replace(/\\"/g, '"');
           console.log("Attempting parse after cleanup...");
           return JSON.parse(fixedString);
       } catch (fixError) {
           console.error("Error parsing JSON even after attempting fixes:", fixError.message);
           // Fallback based on apparent structure
           const trimmed = jsonString.trim();
           if (trimmed.startsWith('[') && trimmed.endsWith(']')) return [];
           if (trimmed.startsWith('{') && trimmed.endsWith('}')) return {};
           return null; // Return null if all attempts fail
       }
     }
  }

  // Retry mechanism for API calls (keep for potential direct calls if services fail)
  function retryApiCall(apiCall, maxRetries = 2, delay = 1000) { // Reduced maxRetries to 2 (total 3 attempts)
     return new Promise((resolve, reject) => {
       const attempt = (retryCount) => {
         console.log(`API Call Attempt ${retryCount + 1}/${maxRetries + 1}...`);
         apiCall()
           .then(resolve)
           .catch((error) => {
             const isAuthError = error?.status === 401 || error?.status === 403;
             console.warn(`API call failed (attempt ${retryCount + 1}/${maxRetries + 1}):`, error?.message || error, `Status: ${error?.status || 'N/A'}`);

             if (retryCount < maxRetries) {
               // Optional: Add specific logic for auth errors if needed (e.g., trigger token refresh)
               if (isAuthError) {
                  console.warn("Authentication error detected during API call.");
                  // Trigger token refresh? Be careful not to create loops.
                  // handleTokenRefresh(document.getElementById('flashcard-app-iframe')); // Example call
               }
               const retryDelay = delay * Math.pow(2, retryCount); // Exponential backoff
               console.log(`Retrying in ${retryDelay / 1000} seconds...`);
               setTimeout(() => attempt(retryCount + 1), retryDelay);
             } else {
               console.error(`API call failed after ${maxRetries + 1} attempts.`);
               reject(error); // Reject after final attempt
             }
           });
       };
       attempt(0); // Start the first attempt
     });
  }


  // Data migration: Convert 'type' field to 'questionType'
  function migrateTypeToQuestionType(data) {
       // Handle single objects recursively
       const migrateObject = (item) => {
            if (item && typeof item === 'object' && 'type' in item && !('questionType' in item)) {
                const newItem = { ...item }; // Create a copy
                newItem.questionType = newItem.type === 'basic' ? 'basic_and_reversed' : newItem.type;
                // Only delete 'type' if it's one of the ones we're replacing
                const typesToDelete = ['basic', 'basic_and_reversed', 'multiple_choice', 'short_answer'];
                if (typesToDelete.includes(newItem.type)) {
                   delete newItem.type;
                }
                return newItem;
            }
            return item; // Return unchanged if no migration needed
       }

       if (Array.isArray(data)) {
           return data.map(migrateObject);
       } else if (data && typeof data === 'object') {
           return migrateObject(data);
       }

       // console.warn("migrateTypeToQuestionType: Input is not an array or migratable object", data);
       return data; // Return original data if not array or applicable object
  }


  // Basic check for Knack ID format
  function isValidKnackId(id) {
     return typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id);
  }


  // Function to clean HTML from a string that might contain a Knack record ID
  function cleanHtmlFromId(idString) {
       if (typeof idString !== 'string') return null;

       const trimmed = idString.trim();
       if (isValidKnackId(trimmed)) {
           return trimmed;
       }

       // Check for Knack's object format [{id: 'xxx'}] first, as it's common
       try {
           const parsed = JSON.parse(trimmed);
           if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].id && isValidKnackId(parsed[0].id)) {
               return parsed[0].id;
           }
       } catch (e) { /* Ignore JSON parsing errors here */ }

       // Use DOMParser for potentially HTML-wrapped IDs
       try {
           if (trimmed.includes('<') && trimmed.includes('>')) {
               const parser = new DOMParser();
               const doc = parser.parseFromString(trimmed, 'text/html');
               let potentialId = doc.body.textContent || "";
               potentialId = potentialId.trim();
               if (isValidKnackId(potentialId)) {
                   return potentialId;
               }
           }
       } catch(e) {
            console.warn("DOMParser failed for ID cleaning:", e);
       }

       // console.warn("cleanHtmlFromId: Could not extract a valid Knack ID from:", idString);
       return null;
  }


  // Function to extract a valid Knack record ID
  function extractValidRecordId(value) {
       if (!value) return null;

       // 1. Direct valid ID string
       if (typeof value === 'string' && isValidKnackId(value)) {
           return value;
       }

       // Handle case where value might be a string needing cleaning (HTML or object string)
       if (typeof value === 'string') {
           const cleanedFromString = cleanHtmlFromId(value);
           if (isValidKnackId(cleanedFromString)) {
               return cleanedFromString;
           }
       }

       // 2. Array with an object containing 'id'
       if (Array.isArray(value) && value.length > 0 && value[0] && value[0].id) {
           const idFromArray = cleanHtmlFromId(value[0].id); // Clean the ID within the array obj
           if (isValidKnackId(idFromArray)) {
              return idFromArray;
           }
       }

       // 3. Object with 'id' property
       if (typeof value === 'object' && value !== null && value.id) {
            const idFromObj = cleanHtmlFromId(value.id); // Clean the ID within the object
            if (isValidKnackId(idFromObj)) {
               return idFromObj;
            }
       }

       // console.warn("extractValidRecordId: Could not extract valid ID from value:", value);
       return null;
  }

  // Sanitize field values before sending to Knack API (keep for direct calls if needed)
  function sanitizeField(value) {
     if (value === null || typeof value === 'undefined') {
       return ''; // Return empty string for null or undefined
     }
     let stringValue = String(value);
     // Remove HTML tags more robustly
     try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(stringValue, 'text/html');
        stringValue = doc.body.textContent || "";
     } catch(e) {
        // Fallback basic regex if DOMParser fails
        stringValue = stringValue.replace(/<[^>]*>?/gm, '');
     }
     return stringValue.trim();
  }


  // Helper for debug logging
  function debugLog(title, data) {
       const isDebugMode = typeof window !== 'undefined' && (window.location.search.includes('debug=true') || window.VESPA_DEBUG);
       if (isDebugMode) {
           // Use console.group for better readability
           console.group(`[DEBUG] ${title}`);
           if (typeof data === 'object') {
              console.log(JSON.stringify(data, null, 2));
           } else {
              console.log(data);
           }
           console.groupEnd();
       }
  }

  // --- End Helper Functions ---

  // Function to load the persistence services from the iframe's window
  function loadPersistenceServices() {
    console.log("Attempting to load persistence services from iframe window...");
    const iframe = document.getElementById('flashcard-app-iframe');
    if (!iframe || !iframe.contentWindow) {
        console.error("loadPersistenceServices: Iframe not found or not accessible.");
        servicesReady = false; // Ensure flag is false if iframe missing
        return false;
    }

    try {
      const cw = iframe.contentWindow; // Content window of the iframe

      // --- Try to load the NEW service names first (as per Implementation Plan) ---
      saveQueueManager = cw.saveQueueManager || null;
      cardTopicRelationshipManager = cw.cardTopicRelationshipManager || null;
      messageHandler = cw.messageHandler || null; // Assumes React sets window.messageHandler
      saveVerificationService = cw.saveVerificationService || null;

      // Log found/missing new services
      console.log(`Found saveQueueManager: ${!!saveQueueManager}`);
      console.log(`Found cardTopicRelationshipManager: ${!!cardTopicRelationshipManager}`);
      console.log(`Found messageHandler: ${!!messageHandler}`);
      console.log(`Found saveVerificationService: ${!!saveVerificationService}`);

      // --- Also try to load OLDER service names as a fallback / compatibility ---
      unifiedPersistenceManager = cw.unifiedPersistenceManager || null;
      topicShellManager = cw.topicShellManager || null;
      metadataManager = cw.metadataManager || null;
      colorManager = cw.colorManager || null;
      dataOperationQueue = cw.dataOperationQueue || null;

      // Log found/missing old services
      // console.log(`Found unifiedPersistenceManager (Old): ${!!unifiedPersistenceManager}`);
      // console.log(`Found topicShellManager (Old): ${!!topicShellManager}`);

      // Attempt to map old services to new ones if new ones are missing (use carefully)
      if (!saveQueueManager && unifiedPersistenceManager) {
          console.warn("Mapping unifiedPersistenceManager to saveQueueManager.");
          saveQueueManager = unifiedPersistenceManager;
      }
      if (!cardTopicRelationshipManager && topicShellManager) {
          console.warn("Mapping topicShellManager to cardTopicRelationshipManager.");
          cardTopicRelationshipManager = topicShellManager;
      }
      // Map others if necessary based on functionality

      // Determine success based on *key new* services being present
      // Adjust this based on which services are absolutely essential
      servicesReady = !!(saveQueueManager && cardTopicRelationshipManager); // messageHandler & verification are optional?

      if (servicesReady) {
          console.log("Core persistence services loaded/mapped successfully from iframe window.");
      } else {
          console.error("Failed to load required core persistence services (SaveQueueManager, CardTopicRelationshipManager) from iframe window.");
      }

      return servicesReady; // Return status

    } catch (error) {
      console.error("Error loading persistence services from iframe:", error);
      servicesReady = false;
      return false;
    }
  }

  // Initialize Flashcard App
  function initializeFlashcardApp(containerElement) {
    console.log("Initializing Flashcard React app inside element:", containerElement.id);
    var container = containerElement;
    var iframe = document.getElementById('flashcard-app-iframe'); // Try to get existing iframe first
    var loadingDiv = document.getElementById('loading-indicator'); // Assuming this ID exists

    if (!container) {
        console.error(`Flashcard app: Invalid container element passed. Cannot proceed.`);
        if (loadingDiv) loadingDiv.textContent = 'Error: App container element invalid.';
        return;
    }

    // If iframe doesn't exist, create it
    if (!iframe) {
        console.log("Creating iframe...");
        iframe = document.createElement('iframe');
        iframe.id = 'flashcard-app-iframe'; // Consistent ID
        iframe.style.width = '100%';
        iframe.style.height = '80vh'; // Adjust as needed
        iframe.style.border = 'none';
        iframe.style.display = 'none'; // Hide initially
        iframe.title = "Flashcard Application"; // Accessibility

        const appUrl = window.VESPA_CONFIG.appUrl || 'https://vespa-flashcards-e7f31e9ff3c9.herokuapp.com/'; // Fallback URL
        iframe.src = appUrl;

        // Add loading indicator inside container before iframe
        if (loadingDiv) {
            container.appendChild(loadingDiv);
            loadingDiv.style.display = 'block';
            loadingDiv.textContent = 'Loading Flashcard App...';
        } else {
            // Create simple loading indicator if none exists
            const simpleLoading = document.createElement('div');
            simpleLoading.id = 'loading-indicator';
            simpleLoading.textContent = 'Loading Flashcard App...';
            simpleLoading.style.padding = '20px';
            simpleLoading.style.textAlign = 'center';
            container.appendChild(simpleLoading);
            loadingDiv = simpleLoading; // Assign for later use
        }

        container.appendChild(iframe);
        console.log("Flashcard app: Dynamically created and appended iframe.");
    } else {
        console.log("Flashcard app: Using existing iframe.");
        // Ensure loading indicator is visible if reusing
        if (loadingDiv) loadingDiv.style.display = 'block';
        iframe.style.display = 'none'; // Hide iframe until ready
        // Consider resetting iframe src if needed on re-initialization?
        // iframe.src = iframe.src;
    }

    // Get Knack details
    var userToken = Knack.getUserToken();
    var appId = Knack.app.id;
    var currentUser = Knack.getUserAttributes();

    if (Knack && userToken && currentUser && currentUser.id) {
      window.currentKnackUser = currentUser; // Store globally

      // Remove previous listener if any to prevent duplicates on re-renders
      window.removeEventListener('message', handleIframeMessage);
      // Setup message listener
      window.addEventListener('message', handleIframeMessage);
      console.log("Message listener attached.");

    } else {
      console.error("Flashcard app: User is not authenticated or user attributes unavailable.");
      if (loadingDiv) loadingDiv.textContent = 'Error: User authentication failed.';
    }
  }

  // Named function for handling messages from the iframe
  function handleIframeMessage(event) {
      const iframe = document.getElementById('flashcard-app-iframe');
      // Validate source and basic message structure
      if (!iframe || event.source !== iframe.contentWindow || !event.data || !event.data.type) {
          // console.log("Ignoring message from unknown source or invalid format", event.origin);
          return;
      }

      // console.log(`Knack script received message: ${event.data.type}`); // Less verbose logging
      // Use debugLog for detailed message content if needed
      // debugLog(`RECEIVED MESSAGE: ${event.data.type}`, event.data);

      // --- Centralized Message Handling ---
      // Prioritize using the messageHandler service if it's ready
      if (messageHandler && typeof messageHandler.handleMessage === 'function') {
          // console.log("Forwarding message to MessageHandler service.");
          try {
              // Give the service the full event for context if needed
              messageHandler.handleMessage(event);
          } catch (e) {
              console.error("Error calling messageHandler.handleMessage:", e);
              // Fallback to manual handling ONLY if service fails critically
              // handleMessageManually(event.data); // Avoid if possible
          }
          // Decide if we should return here. If the service handles everything, yes.
          // If manual handling should *also* run for some messages, remove return.
          // For now, assume service handles it exclusively if present.
          // return; // Let's allow manual handling to run as well for robustness for now
      }

      // --- Manual/Fallback Message Handling ---
      // Run this regardless of messageHandler for now, can be refined later
      handleMessageManually(event.data);
  }

  // Manual message handling logic (refactored switch statement)
  function handleMessageManually(messageData) {
      const iframe = document.getElementById('flashcard-app-iframe');
      const user = window.currentKnackUser;
      const userToken = Knack.getUserToken();
      const appId = Knack.app.id;
      const loadingDiv = document.getElementById('loading-indicator');

      // Ignore if user data isn't available yet for most actions
      if (messageData.type !== 'APP_READY' && messageData.type !== 'PERSISTENCE_SERVICES_READY' && !user) {
          console.warn(`Received message ${messageData.type} before user was ready. Ignoring.`);
          return;
      }

      switch(messageData.type) {
          case 'APP_READY':
              if (appReadyHandled) {
                  // console.log("Ignoring duplicate APP_READY");
                  return;
              }
              appReadyHandled = true;
              console.log("React app is ready (APP_READY received). Attempting to load services...");

              // Attempt to load services FROM IFRAME now that app signals readiness
              if (loadPersistenceServices()) {
                 console.log("Services loaded successfully after APP_READY.");
                 // Now proceed to load user data and send auth
                 loadAndSendInitialData(user, userToken, appId, iframe);
              } else {
                 console.error("Failed to load services after APP_READY. App may not function correctly.");
                 if (loadingDiv) loadingDiv.textContent = 'Error: Failed to load application services.';
                 // Consider attempting to load/send basic data anyway?
                 // loadAndSendInitialData(user, userToken, appId, iframe);
              }
              break;

          // This message type is now just a signal, services are loaded via window access
          case 'PERSISTENCE_SERVICES_READY':
               console.log("Received PERSISTENCE_SERVICES_READY signal. Verifying services...");
               // If services haven't been loaded yet (e.g., race condition), try again
               if (!servicesReady) {
                   console.warn("Services not yet loaded, attempting load based on PERSISTENCE_SERVICES_READY signal...");
                   if (loadPersistenceServices() && !authSent && user) {
                       // If services load now and we haven't sent auth, do it.
                       console.log("Services loaded after PERSISTENCE_SERVICES_READY, sending initial data.");
                       loadAndSendInitialData(user, userToken, appId, iframe);
                   } else if (!servicesReady) {
                       console.error("Still failed to load services after PERSISTENCE_SERVICES_READY signal.");
                   }
               } else {
                   console.log("Services already loaded.");
               }
               break;

          case 'SAVE_DATA':
              console.log(`Save data request received.`);
              debugLog("SAVE_DATA PAYLOAD", messageData.data);
              if (!servicesReady || !saveQueueManager) {
                  console.error("Cannot SAVE_DATA: SaveQueueManager service not available.");
                  notifySaveResult(iframe, false, "Save service not ready", messageData.data?.recordId);
                  return;
              }
              handleSaveData(messageData.data) // Use the refactored function
                  .then(result => {
                      notifySaveResult(iframe, true, null, result?.recordId || messageData.data?.recordId);
                  })
                  .catch(error => {
                      console.error("Error during handleSaveData:", error);
                      notifySaveResult(iframe, false, error.message || "Unknown save error", messageData.data?.recordId);
                  });
              break;

          case 'AUTH_CONFIRMED':
              console.log("Authentication confirmed by React app");
              authConfirmReceived = true;
              if (loadingDiv) loadingDiv.style.display = 'none';
              if (iframe) iframe.style.display = 'block'; // Show iframe
              break;

          case 'ADD_TO_BANK':
              console.log("Add to bank request received.");
              debugLog("ADD_TO_BANK PAYLOAD", messageData.data);
              if (!servicesReady || !saveQueueManager) {
                  console.error("Cannot ADD_TO_BANK: SaveQueueManager service not available.");
                  notifyAddToBankResult(iframe, false, "Save service not ready");
                  return;
              }
              handleAddToBankPromise(messageData.data) // Use the refactored function
                  .then(() => {
                      notifyAddToBankResult(iframe, true, null, true); // Success, suggest reload/refresh
                      // Request updated data instead of forcing reload
                      requestUpdatedData(iframe, messageData.data?.recordId);
                  })
                  .catch(error => {
                      console.error("Failed to add cards to bank:", error);
                      notifyAddToBankResult(iframe, false, error.message || "Failed to add cards", false);
                  });
              break;

          case 'TOPIC_LISTS_UPDATED':
              console.log(`Received TOPIC_LISTS_UPDATED`);
              debugLog("TOPIC_LISTS_UPDATED PAYLOAD", messageData.data);
              // Use CardTopicRelationshipManager for this
              if (!servicesReady || !cardTopicRelationshipManager) {
                  console.error("Cannot process TOPIC_LISTS_UPDATED: CardTopicRelationshipManager service not available.");
                  return;
              }
              if (messageData.data && messageData.data.topicLists && messageData.data.recordId) {
                  console.log(`Creating/updating topic shells from updated topic lists`);
                  createTopicShellsFromLists(messageData.data.topicLists, messageData.data.recordId); // Use refactored function
                  // No forced reload here, rely on service/React to update UI or request data
              } else {
                  console.warn(`TOPIC_LISTS_UPDATED message missing data. Cannot create shells.`);
              }
              break;

          case 'RELOAD_APP_DATA': // Treat reload request as request for updated data
          case 'REQUEST_UPDATED_DATA':
              console.log(`Received ${messageData.type}. Requesting updated data...`);
              // Try to get recordId from message, fallback to loaded recordId, fallback to user.id? Risky.
              const targetRecordId = messageData.recordId || (user && user.recordId) || null;
              if (targetRecordId) {
                 requestUpdatedData(iframe, targetRecordId);
              } else {
                 console.error(`Cannot request updated data: No recordId available.`);
                 // Notify React app?
              }
              break;

          case 'REQUEST_TOKEN_REFRESH':
          case 'AUTH_REFRESH_NEEDED': // Treat both as needing a token refresh attempt
               console.log(`Received ${messageData.type}, attempting token refresh.`);
               handleTokenRefresh(iframe);
               break;

          case 'REQUEST_RECORD_ID':
              console.log(`Record ID requested from React app`);
              if (user && user.id) {
                 loadAndSendRecordId(iframe, user.id);
              } else {
                 console.error("Cannot request record ID: User ID not available.");
                 // Notify React app?
              }
              break;

          // Add other cases based on your React app's needs
           case 'UPDATE_KNACK_BOX_STATUS': // Handle request from React to update Knack fields
                console.log("Received request to update Knack box status");
                if (messageData.data && messageData.data.userId && messageData.data.boxStatus) {
                    updateKnackBoxFields(messageData.data.userId, messageData.data.boxStatus);
                } else {
                    console.warn("Invalid data for UPDATE_KNACK_BOX_STATUS");
                }
                break;


          default:
              console.warn(`Unhandled message type from React app: ${messageData.type}`);
              debugLog("UNHANDLED MESSAGE PAYLOAD", messageData);
      }
  }

  // Function to load user data and send initial info to iframe
  function loadAndSendInitialData(user, userToken, appId, iframe) {
       if (authSent) {
           // console.log("Auth already sent, skipping duplicate send.");
           return;
       }
       if (!user || !user.id) {
           console.error("Cannot send initial data: Invalid user object.");
           return;
       }
       // Ensure services are ready before loading data that might depend on them
       if (!servicesReady) {
           console.error("Cannot load initial data: Services not ready.");
           // Maybe try loading services again?
           // loadPersistenceServices(); // Be careful of loops
           return;
       }

       console.log("Loading user data to send initial info...");
       setLoadingProgress("Loading user data..."); // Update loading message

       loadFlashcardUserData(user.id) // Use the refactored load function which returns a promise
           .then(userData => {
                // userData might be null if record doesn't exist yet
                if (userData === null) {
                    console.log("No existing user data found. Creating new record...");
                    setLoadingProgress("Creating user record...");
                    return createFlashcardUserRecord(user.id).then(createResult => {
                        if (createResult.success) {
                           console.log("New record created:", createResult.recordId);
                           // Return empty data structure with the new record ID
                           return {
                               recordId: createResult.recordId,
                               cards: [], colorMapping: {}, topicLists: [], topicMetadata: [],
                               spacedRepetition: { box1: [], box2: [], box3: [], box4: [], box5: [] }
                           };
                        } else {
                           throw new Error("Failed to create new user record.");
                        }
                    });
                } else {
                   console.log("User data loaded successfully:", userData.recordId);
                   // Add recordId to user object if not already there? Might be useful.
                   if (!user.recordId) user.recordId = userData.recordId;
                   return userData; // Pass existing data along
                }
           })
           .then(finalUserData => {
               console.log("Sending KNACK_USER_INFO to React app.");
               setLoadingProgress("Finalizing setup...");
               const userDataToSend = {
                   id: user.id,
                   email: user.email,
                   name: user.name || '',
                   token: userToken,
                   appId: appId, // Knack's app ID
                   userData: finalUserData || {}, // Send loaded/created data or empty object
                   // Extract connection IDs using helper
                   emailId: extractValidRecordId(user.id),
                   schoolId: extractValidRecordId(user.school || user.field_122),
                   tutorId: extractValidRecordId(user.tutor),
                   roleId: extractValidRecordId(user.role)
               };

               debugLog("SENDING KNACK_USER_INFO", userDataToSend);

               if (iframe && iframe.contentWindow) {
                   iframe.contentWindow.postMessage({
                       type: 'KNACK_USER_INFO',
                       data: userDataToSend
                   }, '*');
                   authSent = true; // Mark as sent
                   console.log("Sent KNACK_USER_INFO.");
                   // Note: App visibility is now handled by AUTH_CONFIRMED message from React
               } else {
                   console.error("Cannot send KNACK_USER_INFO: Iframe not available.");
                   setLoadingProgress("Error: Communication channel lost.");
               }
           })
           .catch(error => {
               console.error("Critical Error during initial data load/create:", error);
               setError(`Failed to initialize user data: ${error.message}`);
               setLoadingProgress(`Error: ${error.message}`);
               // Optionally send basic auth info even on failure?
               /*
               const basicDataToSend = { id: user.id, email: user.email, name: user.name || '', token: userToken, appId: appId, userData: {} };
               if (iframe && iframe.contentWindow) {
                  iframe.contentWindow.postMessage({ type: 'KNACK_USER_INFO', data: basicDataToSend }, '*');
                  authSent = true;
                  console.warn("Sent basic KNACK_USER_INFO despite data load failure.");
               }
               */
           });
  }

   // Function to request updated data from services and send to React app
   function requestUpdatedData(iframe, recordIdentifier) { // Can be recordId or userId
        console.log(`Requesting updated data for identifier: ${recordIdentifier}`);
        if (!servicesReady || !saveQueueManager) { // Use saveQueueManager as proxy for data services
            console.error("Cannot request updated data: Services not ready.");
             if (iframe && iframe.contentWindow) {
                 iframe.contentWindow.postMessage({ type: 'DATA_REFRESH_ERROR', error: 'Services not available' }, '*');
             }
            return;
        }
        // Determine if identifier is likely a userId or recordId (basic check)
        const isUserId = !isValidKnackId(recordIdentifier);
        const idToLoad = isUserId ? window.currentKnackUser?.id : recordIdentifier; // Prefer userId if ambiguous? No, use what's passed.

        if (!idToLoad) {
             console.error("Cannot request updated data: Invalid identifier provided.");
             return;
        }

        console.log(`Using service to load data for ${isUserId ? 'userId' : 'recordId'}: ${idToLoad}`);

        // Assuming saveQueueManager or another service has a method like `getUserData`
        let loadPromise;
        // Prioritize service method if available
        if (saveQueueManager && typeof saveQueueManager.getUserData === 'function') {
            loadPromise = saveQueueManager.getUserData(idToLoad); // Pass identifier
        } else {
            console.warn("saveQueueManager.getUserData not found, attempting direct API fallback.");
            loadPromise = loadUserDataDirectAPI(idToLoad); // Fallback to direct API
        }

        loadPromise
            .then(userData => {
                if (userData && iframe && iframe.contentWindow) {
                    console.log(`Sending refreshed data to React app (Record ID: ${userData.recordId})`);
                    // Ensure data is migrated before sending
                    const migratedUserData = {
                        ...userData,
                        cards: migrateTypeToQuestionType(userData.cards || []),
                        spacedRepetition: { // Also migrate SR box content if needed
                            box1: migrateTypeToQuestionType(userData.spacedRepetition?.box1 || []),
                            box2: migrateTypeToQuestionType(userData.spacedRepetition?.box2 || []),
                            box3: migrateTypeToQuestionType(userData.spacedRepetition?.box3 || []),
                            box4: migrateTypeToQuestionType(userData.spacedRepetition?.box4 || []),
                            box5: migrateTypeToQuestionType(userData.spacedRepetition?.box5 || []),
                        }
                    };
                    iframe.contentWindow.postMessage({
                        type: 'KNACK_DATA', // Use KNACK_DATA type expected by React
                        // Structure based on KnackJavascript4q.js/React app needs
                        cards: migratedUserData.cards,
                        colorMapping: migratedUserData.colorMapping || {},
                        topicLists: migratedUserData.topicLists || [],
                        topicMetadata: migratedUserData.topicMetadata || [],
                        spacedRepetition: migratedUserData.spacedRepetition, // Send SR data
                        recordId: migratedUserData.recordId, // Ensure service returns recordId
                        auth: { // Include basic auth info
                            id: window.currentKnackUser?.id,
                            email: window.currentKnackUser?.email,
                            name: window.currentKnackUser?.name || ''
                         },
                        timestamp: new Date().toISOString()
                    }, '*');
                } else if (!userData) {
                    console.error(`Error loading updated data: No data returned for ${idToLoad}.`);
                    if (iframe && iframe.contentWindow) {
                       iframe.contentWindow.postMessage({ type: 'DATA_REFRESH_ERROR', error: 'Failed to load data' }, '*');
                    }
                }
            })
            .catch(error => {
                console.error(`Error loading updated data:`, error);
                 if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.postMessage({ type: 'DATA_REFRESH_ERROR', error: error.message || 'Failed to load data' }, '*');
                 }
            });
    }

  // Function to load record ID and send to React app
  function loadAndSendRecordId(iframe, userId) {
       if (!userId) {
            console.error("Cannot load record ID: Missing userId");
            return;
       }
       // First, check if we already have it on the user object
       if(window.currentKnackUser?.recordId) {
            console.log(`Found record ID on user object: ${window.currentKnackUser.recordId}`);
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage({ type: 'RECORD_ID_RESPONSE', recordId: window.currentKnackUser.recordId }, '*');
            }
            return;
       }

       // If not, try using services or fallback
       console.log(`Attempting to find record ID for user: ${userId}`);
       if (!servicesReady || !saveQueueManager) { // Or appropriate service
           console.warn("Cannot get record ID via service: Services not ready. Falling back to direct load.");
           // Fallback: Load full data just to get the ID
           loadUserDataDirectAPI(userId)
               .then(userData => {
                   if (userData && userData.recordId && iframe && iframe.contentWindow) {
                       console.log(`Found record ID via direct load: ${userData.recordId}`);
                       // Store it for next time
                       if(window.currentKnackUser) window.currentKnackUser.recordId = userData.recordId;
                       iframe.contentWindow.postMessage({ type: 'RECORD_ID_RESPONSE', recordId: userData.recordId }, '*');
                   } else if (iframe && iframe.contentWindow) {
                        console.error(`Could not find record ID for user ${userId} via direct load.`);
                        iframe.contentWindow.postMessage({ type: 'RECORD_ID_ERROR', error: 'Record ID not found' }, '*');
                   }
               })
               .catch(error => {
                    console.error(`Error finding record ID via direct load:`, error);
                    if (iframe && iframe.contentWindow) {
                        iframe.contentWindow.postMessage({ type: 'RECORD_ID_ERROR', error: error.message || 'Error finding Record ID' }, '*');
                    }
               });
           return;
       }

       // Assume a service method exists, e.g., saveQueueManager.findUserRecordId(userId)
       let findPromise;
        if (saveQueueManager && typeof saveQueueManager.findUserRecordId === 'function') {
           findPromise = saveQueueManager.findUserRecordId(userId);
        } else {
             console.warn("No specific service method found for finding record ID. Falling back to loading full data.");
             findPromise = loadUserDataDirectAPI(userId).then(ud => ud?.recordId); // Use direct API as fallback
        }

       findPromise
           .then(recordId => {
               if (recordId && iframe && iframe.contentWindow) {
                   console.log(`Found record ID via service: ${recordId}`);
                   if(window.currentKnackUser) window.currentKnackUser.recordId = recordId; // Store it
                   iframe.contentWindow.postMessage({ type: 'RECORD_ID_RESPONSE', recordId: recordId }, '*');
               } else {
                   console.error(`Could not find record ID for user ${userId} via service`);
                   if (iframe && iframe.contentWindow) {
                       iframe.contentWindow.postMessage({ type: 'RECORD_ID_ERROR', error: 'Record ID not found' }, '*');
                   }
               }
           })
           .catch(error => {
               console.error(`Error finding record ID via service:`, error);
               if (iframe && iframe.contentWindow) {
                   iframe.contentWindow.postMessage({ type: 'RECORD_ID_ERROR', error: error.message || 'Error finding Record ID' }, '*');
               }
           });
   }

  // Load user data - Refactored to prioritize services, handle creation
  function loadFlashcardUserData(userId) {
      return new Promise((resolve, reject) => {
          console.log("Loading flashcard user data for:", userId);
          if (!userId) return reject(new Error("User ID is required"));

          if (servicesReady && saveQueueManager && typeof saveQueueManager.getUserData === 'function') {
              console.log("Using SaveQueueManager service for loading data");
              saveQueueManager.getUserData(userId)
                  .then(userData => {
                      if (userData) {
                         console.log("Successfully loaded user data with service:", userData.recordId);
                         resolve(migrateTypeToQuestionType(userData)); // Apply migration
                      } else {
                         console.log("Service returned no data (user record likely doesn't exist).");
                         resolve(null); // Indicate record needs creation
                      }
                  })
                  .catch(error => {
                      console.error("Error loading user data with service:", error);
                      // Fallback to Direct API only if service fails unexpectedly
                      console.warn("Service failed, attempting fallback direct API call...");
                      loadUserDataDirectAPI(userId).then(resolve).catch(reject);
                  });
          } else {
              console.warn("Services not ready or load method unavailable. Falling back to direct API call.");
              loadUserDataDirectAPI(userId).then(resolve).catch(reject);
          }
      });
  }

   // Direct API call logic for loading data (Fallback)
   function loadUserDataDirectAPI(userId) {
       return new Promise((resolve, reject) => {
           console.log("Executing direct API call to load user data for:", userId);
           const apiCall = () => new Promise((res, rej) => {
               // Ensure config is available
                if (!knackAppId || !knackApiKey || !KNACK_API_URL || !FLASHCARD_OBJECT || !FIELD_MAPPING.userId) {
                    return rej(new Error("Missing Knack API configuration for direct call."));
                }
               $.ajax({
                   url: `${KNACK_API_URL}/objects/${FLASHCARD_OBJECT}/records`,
                   type: 'GET',
                   headers: {
                       'X-Knack-Application-Id': knackAppId,
                       'X-Knack-REST-API-Key': knackApiKey,
                       'Authorization': Knack.getUserToken(),
                       'Content-Type': 'application/json'
                   },
                   data: {
                       format: 'raw',
                       rows_per_page: 1, // Only need one record
                       filters: JSON.stringify({
                           match: 'and',
                           rules: [{ field: FIELD_MAPPING.userId, operator: 'is', value: userId }]
                       })
                   },
                   success: response => res(response),
                   error: (jqXHR, textStatus, errorThrown) => {
                      rej(new Error(`API Error ${jqXHR.status}: ${jqXHR.responseText || errorThrown}`));
                    }
               });
           });

           retryApiCall(apiCall) // Uses updated retry logic
               .then(response => {
                   // console.log("Direct API search response:", response);
                   if (response.records && response.records.length > 0) {
                       const record = response.records[0];
                       console.log("Found existing user data via direct API:", record.id);
                       try {
                            // --- Parsing Logic ---
                            const userData = { recordId: record.id };
                            // Use safeParseJSON for all potentially JSON fields
                            userData.cards = safeParseJSON(record[FIELD_MAPPING.cardBankData], []);
                            userData.colorMapping = safeParseJSON(record[FIELD_MAPPING.colorMapping], {});
                            userData.topicLists = safeParseJSON(record[FIELD_MAPPING.topicLists], []);
                            userData.topicMetadata = safeParseJSON(record[FIELD_MAPPING.topicMetadata], []);
                            userData.spacedRepetition = {
                                box1: safeParseJSON(record[FIELD_MAPPING.box1Data], []),
                                box2: safeParseJSON(record[FIELD_MAPPING.box2Data], []),
                                box3: safeParseJSON(record[FIELD_MAPPING.box3Data], []),
                                box4: safeParseJSON(record[FIELD_MAPPING.box4Data], []),
                                box5: safeParseJSON(record[FIELD_MAPPING.box5Data], [])
                            };
                            // Apply migrations after parsing
                            userData.cards = migrateTypeToQuestionType(userData.cards);
                            // Migrate SR boxes if necessary (assuming they contain card objects/IDs)
                             userData.spacedRepetition.box1 = migrateTypeToQuestionType(userData.spacedRepetition.box1);
                             userData.spacedRepetition.box2 = migrateTypeToQuestionType(userData.spacedRepetition.box2);
                             userData.spacedRepetition.box3 = migrateTypeToQuestionType(userData.spacedRepetition.box3);
                             userData.spacedRepetition.box4 = migrateTypeToQuestionType(userData.spacedRepetition.box4);
                             userData.spacedRepetition.box5 = migrateTypeToQuestionType(userData.spacedRepetition.box5);
                            // --- End Parsing & Migration ---
                            console.log(`Direct API Load: Parsed ${userData.cards.length} cards.`);
                            resolve(userData);
                       } catch(e) {
                            console.error("Error parsing user data from direct API record:", e);
                            reject(new Error("Failed to parse user data from API record."));
                       }
                   } else {
                       console.log("No existing user data found via direct API for user:", userId);
                       resolve(null); // Indicate no record found, creation needed
                   }
               })
               .catch(error => {
                   console.error("Error loading user data via direct API after retries:", error);
                   reject(error);
               });
       });
   }

  // Create a new flashcard user record - Prioritize Service
  function createFlashcardUserRecord(userId) {
     return new Promise((resolve, reject) => {
         console.log("Attempting to create new flashcard user record for:", userId);
         const user = window.currentKnackUser;
         if (!user) return reject(new Error("Cannot create record: Missing current user data."));

         if (servicesReady && saveQueueManager && typeof saveQueueManager.createNewUserRecord === 'function') {
             console.log("Using SaveQueueManager service to create user record.");
             const userDetails = {
                 userId: userId,
                 email: user.email, name: user.name,
                 emailId: extractValidRecordId(user.id), // Connections
                 schoolId: extractValidRecordId(user.school || user.field_122),
                 tutorId: extractValidRecordId(user.tutor),
                 roleId: extractValidRecordId(user.role),
                 tutorGroup: user.tutorGroup, // Other fields
                 yearGroup: user.yearGroup
             };
             saveQueueManager.createNewUserRecord(userDetails)
                 .then(result => {
                     if (result && result.success && result.recordId) {
                         console.log("Successfully created user record via service:", result.recordId);
                         resolve({ success: true, recordId: result.recordId });
                     } else {
                         throw new Error("Service reported failure or missing recordId during creation.");
                     }
                 })
                 .catch(error => {
                     console.error("Error creating user record with service:", error);
                     console.warn("Service failed, attempting fallback direct API call for creation...");
                     createRecordDirectAPI(userId, user).then(resolve).catch(reject);
                 });
         } else {
             console.warn("Service not ready or create method unavailable. Falling back to direct API call for creation.");
             createRecordDirectAPI(userId, user).then(resolve).catch(reject);
         }
     });
  }

 // Direct API for creating record (Fallback)
 function createRecordDirectAPI(userId, user) {
    return new Promise((resolve, reject) => {
        console.log("Executing direct API call to create record for:", userId);
        if (!knackAppId || !knackApiKey || !KNACK_API_URL || !FLASHCARD_OBJECT || !FIELD_MAPPING.userId) {
            return reject(new Error("Missing Knack API configuration for direct create call."));
        }

        // Prepare data using FIELD_MAPPING
        const data = {
          [FIELD_MAPPING.userId]: userId,
          [FIELD_MAPPING.userEmail]: sanitizeField(user.email), // Assuming text field for email
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
          [FIELD_MAPPING.userName]: sanitizeField(user.name || "") // Assuming text field for name
        };
        // Add optional text fields only if they exist in FIELD_MAPPING
        if (FIELD_MAPPING.tutorGroup && user.tutorGroup) data[FIELD_MAPPING.tutorGroup] = sanitizeField(user.tutorGroup);
        if (FIELD_MAPPING.yearGroup && user.yearGroup) data[FIELD_MAPPING.yearGroup] = sanitizeField(user.yearGroup);
        // Add connection fields only if they exist in FIELD_MAPPING and have valid IDs
        const emailId = extractValidRecordId(user.id);
        if (FIELD_MAPPING.accountConnection && emailId) data[FIELD_MAPPING.accountConnection] = emailId;
        const schoolId = extractValidRecordId(user.school || user.field_122);
        if (FIELD_MAPPING.vespaCustomer && schoolId) data[FIELD_MAPPING.vespaCustomer] = schoolId;
        const tutorId = extractValidRecordId(user.tutor);
        if (FIELD_MAPPING.tutorConnection && tutorId) data[FIELD_MAPPING.tutorConnection] = tutorId;
        const roleId = extractValidRecordId(user.role);
        if (FIELD_MAPPING.userRole && roleId) data[FIELD_MAPPING.userRole] = roleId;

        debugLog("CREATING NEW RECORD (Direct API)", data);

        $.ajax({
          url: `${KNACK_API_URL}/objects/${FLASHCARD_OBJECT}/records`,
          type: 'POST',
          headers: {
            'X-Knack-Application-Id': knackAppId,
            'X-Knack-REST-API-Key': knackApiKey,
            'Authorization': Knack.getUserToken(),
            'Content-Type': 'application/json'
          },
          data: JSON.stringify(data),
          success: function(response) {
            console.log("Direct API: Successfully created user record:", response.id);
            // Store the new record ID on the global user object
            if (window.currentKnackUser) window.currentKnackUser.recordId = response.id;
            resolve({ success: true, recordId: response.id });
          },
          error: function(jqXHR, textStatus, errorThrown) {
            console.error("Direct API: Error creating user record:", textStatus, errorThrown, jqXHR.responseText);
            reject(new Error(`API Create Error ${jqXHR.status}: ${jqXHR.responseText || errorThrown}`));
          }
        });
    });
 }


  // Handle Save Data - Refactored for Services
  function handleSaveData(data) {
      return new Promise((resolve, reject) => {
          console.log("Handling save data request...");
          const userId = window.currentKnackUser?.id;
          const currentRecordId = data?.recordId || window.currentKnackUser?.recordId; // Get recordId reliably

          if (!userId) return reject(new Error("Missing user ID for save."));
          if (!currentRecordId) return reject(new Error("Missing recordId for save."));

          // Ensure services are ready
          if (!servicesReady || !saveQueueManager) { // saveVerificationService is optional
              console.error("Save cannot proceed: SaveQueueManager service not available.");
              return reject(new Error("Save service not ready."));
          }

          console.log(`Using SaveQueueManager service for saving record ${currentRecordId}.`);
           const auth = { token: Knack.getUserToken(), userId: userId, recordId: currentRecordId };
           // Ensure the data object being passed *also* has the correct recordId
           const saveDataPayload = { ...data, recordId: currentRecordId };

          saveQueueManager.saveUserData(saveDataPayload, auth, data.preserveFields)
              .then(result => {
                  console.log("SaveQueueManager completed save operation.");
                  // Optionally, trigger verification service
                  if (saveVerificationService && typeof saveVerificationService.verifySave === 'function') {
                      console.log("Triggering save verification service...");
                      saveVerificationService.verifySave(currentRecordId, saveDataPayload)
                         .then(() => console.log("Save verification successful."))
                         .catch(verifyError => console.warn("Save verification failed:", verifyError));
                  } else {
                     // If no verification service, maybe do a quick manual check?
                     // verifyDataSaveDirect(currentRecordId, saveDataPayload); // Example manual check
                  }
                  resolve({ success: true, recordId: currentRecordId, ...result });
              })
              .catch(error => {
                  console.error("Error saving data via SaveQueueManager:", error);
                  reject(error);
              });
      });
  }

  // Notify React app about save result
  function notifySaveResult(iframe, success, error, recordId) {
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'SAVE_RESULT',
        success: success,
        error: error ? String(error) : null,
        recordId: recordId,
        timestamp: new Date().toISOString()
      }, '*');
    }
  }

  // Handle Add To Bank - Refactored for Services
  function handleAddToBankPromise(data) {
      return new Promise((resolve, reject) => {
          console.log("Handling add to bank request...");
          const userId = window.currentKnackUser?.id;
          const currentRecordId = data?.recordId || window.currentKnackUser?.recordId; // Get recordId reliably

          if (!userId) return reject(new Error("Missing user ID for AddToBank."));
          if (!currentRecordId) return reject(new Error("Missing recordId for AddToBank."));
          if (!Array.isArray(data.cards)) return reject(new Error("Invalid cards data for AddToBank"));

          if (!servicesReady || !saveQueueManager) {
               console.error("Add To Bank cannot proceed: SaveQueueManager service not available.");
               return reject(new Error("Add to bank service not ready."));
          }

          console.log(`Using SaveQueueManager service for adding ${data.cards.length} cards to bank (record ${currentRecordId}).`);
           const auth = { token: Knack.getUserToken(), userId: userId };

          saveQueueManager.addCardsToBank(currentRecordId, data.cards, auth)
              .then(result => {
                  console.log("SaveQueueManager completed add to bank operation.");
                   // Optionally trigger verification
                   if (saveVerificationService && typeof saveVerificationService.verifyCardAddition === 'function') {
                       saveVerificationService.verifyCardAddition(currentRecordId, data.cards)
                           .catch(verifyError => console.warn("Card addition verification failed:", verifyError));
                   }
                  resolve({ success: true, ...result });
              })
              .catch(error => {
                  console.error("Error adding cards to bank via SaveQueueManager:", error);
                  reject(error);
              });
      });
  }

  // Notify React app about AddToBank result
  function notifyAddToBankResult(iframe, success, error, shouldReload = false) {
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'ADD_TO_BANK_RESULT',
        success: success,
        error: error ? String(error) : null,
        shouldReload: shouldReload,
        timestamp: new Date().toISOString()
      }, '*');
    }
  }

  // Handle Token Refresh
  function handleTokenRefresh(iframe) {
      console.log("Handling token refresh request...");
      try {
          const currentToken = Knack.getUserToken();
          if (!currentToken) {
              console.error("Cannot get current token from Knack.");
               if (iframe && iframe.contentWindow) {
                  iframe.contentWindow.postMessage({ type: "AUTH_REFRESH_RESULT", success: false, error: "Token not available from Knack" }, "*");
               }
              return;
          }
          console.log("Sending current token back to React app for refresh.");
           if (iframe && iframe.contentWindow) {
               iframe.contentWindow.postMessage({
                   type: "AUTH_REFRESH_RESULT", // React expects this type
                   success: true,
                   token: currentToken,
                   // Include user details for context
                   userId: window.currentKnackUser?.id,
                   email: window.currentKnackUser?.email,
                   name: window.currentKnackUser?.name
               }, "*");
           }
      } catch (error) {
          console.error("Error refreshing token:", error);
           if (iframe && iframe.contentWindow) {
              iframe.contentWindow.postMessage({ type: "AUTH_REFRESH_RESULT", success: false, error: error.message || "Unknown error refreshing token" }, "*");
           }
      }
  }

  // Create Topic Shells - Refactored for Services
  function createTopicShellsFromLists(topicLists, recordId) {
      console.log("Handling create/update topic shells request...");
       if (!servicesReady || !cardTopicRelationshipManager) {
           console.error("Create Topic Shells cannot proceed: CardTopicRelationshipManager service not available.");
           // Consider notifying React app of the failure
           return;
       }
       if (!Array.isArray(topicLists) || !recordId) {
            console.warn("Invalid data for createTopicShellsFromLists (missing topicLists array or recordId).");
            return;
       }

      console.log(`Using CardTopicRelationshipManager service for syncing ${topicLists.length} topic lists for record ${recordId}.`);
       const auth = { token: Knack.getUserToken(), userId: window.currentKnackUser?.id };

      // Assume service method `syncTopicShells` exists
      cardTopicRelationshipManager.syncTopicShells(recordId, topicLists, auth)
          .then(result => {
              console.log("CardTopicRelationshipManager completed topic shell sync.", result);
              // Notify React app
               const iframe = document.getElementById('flashcard-app-iframe');
               if (iframe && iframe.contentWindow) {
                  iframe.contentWindow.postMessage({ type: 'TOPIC_SHELLS_CREATED', count: result?.count || topicLists.reduce((sum, list) => sum + (list.topics?.length || 0), 0), timestamp: new Date().toISOString() }, '*');
                  // Request updated data after sync to reflect changes
                  setTimeout(() => requestUpdatedData(iframe, recordId), 500); // Short delay
               }
          })
          .catch(error => {
              console.error("Error syncing topic shells via CardTopicRelationshipManager:", error);
               const iframe = document.getElementById('flashcard-app-iframe');
               if (iframe && iframe.contentWindow) {
                  iframe.contentWindow.postMessage({ type: 'TOPIC_SHELLS_ERROR', error: error.message || "Failed to sync shells" }, '*');
               }
          });
  }

  // Function to update Knack boolean fields based on box status
  function updateKnackBoxFields(targetUserId, boxStatusData) {
      console.log(`Updating Knack box fields for user: ${targetUserId}`);
      // Find the user's record ID first
      loadFlashcardUserData(targetUserId)
        .then(userData => {
            if (!userData || !userData.recordId) {
                throw new Error(`Cannot find record ID for user ${targetUserId} to update box fields.`);
            }
            const recordId = userData.recordId;
            console.log(`Found record ID ${recordId}. Preparing update...`);

            // Prepare data payload - only include fields defined in FIELD_MAPPING
            const updatePayload = {};
            const boxFieldMapping = {
                box1: 'field_2991', box2: 'field_2992', box3: 'field_2993',
                box4: 'field_2994', box5: 'field_2995' // Verify these fields exist in your FIELD_MAPPING
            };

            for (const boxNum in boxStatusData) {
                const fieldName = boxFieldMapping[`box${boxNum}`];
                if (fieldName && FIELD_MAPPING[fieldName]) { // Check if field exists in mapping
                    updatePayload[FIELD_MAPPING[fieldName]] = boxStatusData[boxNum] ? 'Yes' : 'No'; // Knack booleans often use Yes/No
                } else {
                    // console.warn(`Field mapping not found for box ${boxNum} (Expected ${fieldName}). Skipping update for this box.`);
                }
            }

            if (Object.keys(updatePayload).length === 0) {
                console.log("No valid box fields found in mapping to update.");
                return;
            }

            debugLog("KNACK BOX FIELD UPDATE PAYLOAD", updatePayload);

            // Use SaveQueueManager if available for consistency? Or direct update?
            // Direct update is simpler here if SaveQueueManager doesn't have a specific method
             $.ajax({
                url: `${KNACK_API_URL}/objects/${FLASHCARD_OBJECT}/records/${recordId}`,
                type: 'PUT',
                headers: {
                  'X-Knack-Application-Id': knackAppId,
                  'X-Knack-REST-API-Key': knackApiKey,
                  'Authorization': Knack.getUserToken(),
                  'Content-Type': 'application/json'
                },
                data: JSON.stringify(updatePayload),
                success: function(response) {
                  console.log(`Successfully updated Knack box fields for record: ${recordId}`);
                },
                error: function(jqXHR, textStatus, errorThrown) {
                  console.error(`Error updating Knack box fields for record ${recordId}:`, textStatus, errorThrown, jqXHR.responseText);
                }
              });
        })
        .catch(error => {
            console.error("Failed to update Knack box fields:", error);
        });
  }


  // Helper to update loading message
  function setLoadingProgress(message) {
      const loadingDiv = document.getElementById('loading-indicator');
      if (loadingDiv) {
          loadingDiv.textContent = message;
      }
  }

  // Helper to set final error state
  function setError(message) {
       const loadingDiv = document.getElementById('loading-indicator');
       const iframe = document.getElementById('flashcard-app-iframe');
       if(loadingDiv) {
            loadingDiv.textContent = `Error: ${message}`;
            loadingDiv.style.color = 'red';
       }
       if(iframe) iframe.style.display = 'none'; // Hide iframe on critical error
       console.error("Initialization Error:", message);
  }


  // --- Knack specific view render listener ---
  // Use a more reliable event like scene render if view render is problematic
  $(document).on('knack-scene-render.scene_1206', function(event, scene) {
      console.log(`Knack scene ${scene.key} rendered. Looking for flashcard container.`);

      // Use requestAnimationFrame to wait for DOM updates after scene render
      requestAnimationFrame(() => {
          try {
              console.log("Inside requestAnimationFrame. Searching for container...");

              // Robustly find the container
              let viewElementContainer = document.querySelector('#view_3005 .kn-rich-text'); // More specific selector
              console.log("Selector '#view_3005 .kn-rich-text' found:", viewElementContainer);

              if (!viewElementContainer) {
                 viewElementContainer = document.querySelector('.view_3005'); // Fallback class
                 console.log("Selector '.view_3005' found:", viewElementContainer);
              }
              if (!viewElementContainer) {
                 viewElementContainer = document.getElementById('view_3005'); // Fallback ID
                 console.log("Selector '#view_3005' found:", viewElementContainer);
              }

              if (viewElementContainer) {
                  console.log("Found container element. Proceeding to initialize flashcard app.");
                  // Check if already initialized to prevent duplicates if scene re-renders
                  const existingIframe = document.getElementById('flashcard-app-iframe');
                  if (!existingIframe || existingIframe.closest('.view_3005') !== viewElementContainer) {
                      // Clear previous content if re-initializing in the same container
                      viewElementContainer.innerHTML = '';
                      // Reset flags for re-initialization
                      appReadyHandled = false;
                      authSent = false;
                      authConfirmReceived = false;
                      servicesReady = false;
                      initializeFlashcardApp(viewElementContainer);
                  } else {
                     console.log("Flashcard app already seems initialized in this container.");
                     // Optional: If already initialized, maybe just try loading services/data again?
                     // if (!servicesReady) loadPersistenceServices();
                     // if (!authSent && window.currentKnackUser) loadAndSendInitialData(window.currentKnackUser, Knack.getUserToken(), Knack.app.id, existingIframe);
                  }
              } else {
                  console.error("Critical Error: Could not find container element (.view_3005 or #view_3005) in the DOM after scene render!");
                  // Display error more visibly if possible
                  const sceneElement = document.getElementById(scene.key);
                  if (sceneElement) {
                      const errorDiv = document.createElement('div');
                      errorDiv.style.color = 'red';
                      errorDiv.style.padding = '20px';
                      errorDiv.textContent = 'Error: Flashcard application container could not be found.';
                      sceneElement.prepend(errorDiv);
                  }
              }
          } catch (e) {
              console.error("Error inside knack-scene-render listener:", e);
          }
      });
  });
  // --- END Knack listener ---

})();
