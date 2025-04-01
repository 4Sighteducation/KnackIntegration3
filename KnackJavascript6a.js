// knack-integration.js - Safe for public GitHub repository
// Version: 5x (Introduces SaveQueue and corrected message handling)
(function () {
  // Look for configuration in global scope
  if (!window.VESPA_CONFIG) {
    console.error("Flashcard app: Missing VESPA_CONFIG. Please define configuration in Knack.");
    return;
  }

  // --- Configuration and Constants ---
  const knackAppId = window.VESPA_CONFIG.knackAppId;
  const knackApiKey = window.VESPA_CONFIG.knackApiKey;
  const KNACK_API_URL = 'https://api.knack.com/v1';
  const FLASHCARD_APP_CONFIG = window.VESPA_CONFIG.appConfig || {
    'scene_1206': {
      'view_3005': {
        appType: 'flashcard-app',
        elementSelector: '.kn-rich-text',
        appUrl: window.VESPA_CONFIG.appUrl || 'https://vespa-flashcards-e7f31e9ff3c9.herokuapp.com/'
      }
    }
  };
  const FLASHCARD_OBJECT = 'object_102'; // Your flashcard object
  const FIELD_MAPPING = {
    userId: 'field_2954',
    userEmail: 'field_2958',
    accountConnection: 'field_2956',
    vespaCustomer: 'field_3008',
    tutorConnection: 'field_3009',
    cardBankData: 'field_2979',
    lastSaved: 'field_2957',
    box1Data: 'field_2986',
    box2Data: 'field_2987',
    box3Data: 'field_2988',
    box4Data: 'field_2989',
    box5Data: 'field_2990',
    colorMapping: 'field_3000',
    topicLists: 'field_3011',
    topicMetadata: 'field_3030',
    userName: 'field_3010',
    tutorGroup: 'field_565',
    yearGroup: 'field_548',
    userRole: 'field_73'
  };

  // --- Helper Functions (Copied/Adapted from 5w) ---

  // Safe URI component decoding function
  function safeDecodeURIComponent(str) {
    if (!str) return str;
    // Check if it looks like it needs decoding
    if (typeof str === 'string' && !str.includes('%')) return str;
    try {
       // Handle plus signs as spaces which sometimes occur
      return decodeURIComponent(str.replace(/\+/g, ' '));
    } catch (error) {
      console.error("Flashcard app: Error decoding URI component:", error, "String:", String(str).substring(0, 100));
      try {
        // Attempt to fix potentially invalid % sequences
        const cleaned = String(str).replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
        return decodeURIComponent(cleaned.replace(/\+/g, ' '));
      } catch (secondError) {
        console.error("Flashcard app: Second attempt to decode failed:", secondError);
        return String(str); // Return original string if all fails
      }
    }
  }


  // Safely encode URI component
  function safeEncodeURIComponent(str) {
    try {
      return encodeURIComponent(String(str));
    } catch (e) {
      console.error("Error encoding URI component:", e, "Input:", str);
      return String(str);
    }
  }

  // Safe JSON parsing function
  function safeParseJSON(jsonString, defaultVal = null) {
      if (!jsonString) return defaultVal;
      try {
          // If it's already an object (e.g., from Knack raw format), return it directly
          if (typeof jsonString === 'object' && jsonString !== null) return jsonString;
          // Attempt standard parsing
          return JSON.parse(jsonString);
      } catch (error) {
          console.warn("Flashcard app: Initial JSON parse failed:", error, "String:", String(jsonString).substring(0, 100));
          // Attempt recovery for common issues
          try {
              // Remove potential leading/trailing whitespace or BOM
              const cleanedString = String(jsonString).trim().replace(/^\uFEFF/, '');
              // Try common fixes like escaped quotes, trailing commas
              const recovered = cleanedString
                  .replace(/\\"/g, '"') // Fix incorrectly escaped quotes
                  .replace(/,\s*([}\]])/g, '$1'); // Remove trailing commas
              const result = JSON.parse(recovered);
               console.log("Flashcard app: JSON recovery successful.");
              return result;
          } catch (secondError) {
              console.error("Flashcard app: JSON recovery failed:", secondError);
              // Return the default value if all parsing fails
              return defaultVal;
          }
      }
  }


  // Check if a string is a valid Knack record ID
  function isValidKnackId(id) {
    if (!id) return false;
    return typeof id === 'string' && /^[0-9a-f]{24}$/i.test(id);
  }

  // Helper function to clean HTML from IDs
  function cleanHtmlFromId(idString) {
    if (!idString) return null;
    if (typeof idString === 'object' && idString.id) {
      // If it's already an object containing the ID, clean the ID within it.
      return { id: cleanHtmlFromId(idString.id) }; // Return object structure if needed
       // Or just return the cleaned ID: return cleanHtmlFromId(idString.id);
    }
    const str = String(idString); // Ensure it's a string
    if (str.includes('<')) {
      console.warn("Cleaning HTML from potential ID:", str);
      // Match Knack's span format: <span class="kn-tag ..."><a href=...>ID</a></span>
      // Or simpler formats like <span class="...">ID</span>
      const spanMatch = str.match(/<span[^>]*>([^<]+)<\/span>/) || str.match(/<a[^>]*>([^<]+)<\/a>/);
      if (spanMatch && spanMatch[1]) {
         const potentialId = spanMatch[1].trim();
         console.log("Extracted potential ID from HTML:", potentialId);
         return potentialId;
      }
      // Fallback: strip all HTML tags
      const stripped = str.replace(/<[^>]+>/g, '').trim();
       console.log("Stripped HTML:", stripped);
      return stripped;
    }
    return str; // Return as is if no HTML detected
  }


  // Extract a valid record ID from various formats
 function extractValidRecordId(value) {
     if (!value) return null;

     // If it's already an object (like Knack connection field data)
     if (typeof value === 'object') {
         // Check common properties: 'id', 'identifier', or if it's an array with one object
         let idToCheck = null;
         if (value.id) {
             idToCheck = value.id;
         } else if (value.identifier) {
             idToCheck = value.identifier;
         } else if (Array.isArray(value) && value.length === 1 && value[0].id) {
             // Handle cases where connection is an array with one record
             idToCheck = value[0].id;
         } else if (Array.isArray(value) && value.length === 1 && typeof value[0] === 'string') {
              // Handle array with just the ID string
              idToCheck = value[0];
         }


         if (idToCheck) {
             const cleanedId = cleanHtmlFromId(idToCheck); // Clean potential HTML
             return isValidKnackId(cleanedId) ? cleanedId : null;
         }
     }

     // If it's a string
     if (typeof value === 'string') {
         const cleanedId = cleanHtmlFromId(value); // Clean potential HTML
         return isValidKnackId(cleanedId) ? cleanedId : null;
     }

     return null; // Return null if no valid ID found
 }


  // Safely remove HTML from strings
  function sanitizeField(value) {
    if (value === null || value === undefined) return "";
    const strValue = String(value); // Convert to string first
    // Remove HTML tags using a non-greedy match
    let sanitized = strValue.replace(/<[^>]*?>/g, "");
    // Remove common markdown characters
    sanitized = sanitized.replace(/[*_~`#]/g, "");
    // Replace HTML entities (basic set)
    sanitized = sanitized
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&nbsp;/g, " "); // Replace non-breaking space
    return sanitized.trim();
  }


  // Debug logging helper
  function debugLog(title, data) {
    console.log(`%c[Knack Script] ${title}`, 'color: #5d00ff; font-weight: bold; font-size: 12px;');
    // Attempt to deep clone for logging to avoid showing proxies or complex objects directly
    try {
       console.log(JSON.parse(JSON.stringify(data, null, 2)));
    } catch (e) {
       console.log("Data could not be fully serialized for logging:", data); // Log original if clone fails
    }
    return data; // Return data for chaining
  }


  // Generic retry function for API calls
  function retryApiCall(apiCall, maxRetries = 3, delay = 1000) {
    return new Promise((resolve, reject) => {
      const attempt = (retryCount) => {
        apiCall()
          .then(resolve)
          .catch((error) => {
            const attemptsMade = retryCount + 1;
            console.warn(`API call failed (Attempt ${attemptsMade}/${maxRetries}):`, error.status, error.statusText, error.responseText);

            // Check for specific error conditions if needed (e.g., 401/403 for auth)
            // For now, retry on any failure up to maxRetries
            if (retryCount < maxRetries -1) { // Retry maxRetries-1 times
              const retryDelay = delay * Math.pow(2, retryCount); // Exponential backoff
              console.log(`Retrying API call in ${retryDelay}ms...`);
              setTimeout(() => attempt(retryCount + 1), retryDelay);
            } else {
               console.error(`API call failed after ${maxRetries} attempts.`);
              reject(error); // Max retries reached
            }
          });
      };
      attempt(0);
    });
  }

   // Function to refresh authentication (Placeholder - Knack.getUserToken usually sufficient)
   function refreshAuthentication() {
     return new Promise((resolve, reject) => {
       try {
         const currentToken = Knack.getUserToken();
         if (currentToken) {
           console.log(`Auth token available via Knack.getUserToken()`);
           resolve(currentToken);
         } else {
           console.error(`Cannot get auth token - Knack.getUserToken() returned null`);
           reject(new Error("Auth token not available"));
         }
       } catch (error) {
         console.error(`Error getting auth token:`, error);
         reject(error);
       }
     });
   }

   // Handle token refresh request from React app
   function handleTokenRefresh(iframeWindow) { // Added iframeWindow param
     console.log("Handling token refresh request from React app");
     try {
       const currentToken = Knack.getUserToken();
       if (!currentToken) {
         console.error("Cannot get token from Knack");
         if (iframeWindow) iframeWindow.postMessage({ type: "AUTH_REFRESH_RESULT", success: false, error: "Token not available from Knack" }, "*");
         return;
       }
       // Send the current token back
       if (iframeWindow) iframeWindow.postMessage({ type: "AUTH_REFRESH_RESULT", success: true, token: currentToken }, "*");
       console.log("Successfully sent current token for refresh");

     } catch (error) {
       console.error("Error refreshing token:", error);
       if (iframeWindow) iframeWindow.postMessage({ type: "AUTH_REFRESH_RESULT", success: false, error: error.message || "Unknown error refreshing token" }, "*");
     }
   }


  // --- Save Queue Class ---
  class SaveQueue {
    constructor() {
      this.queue = [];
      this.isSaving = false;
      this.retryAttempts = new Map(); // Tracks retries per operation instance
      this.maxRetries = 3;
      this.retryDelay = 1000; // Start with 1 second
    }

    // Adds an operation to the queue and returns a promise that resolves/rejects on completion/failure
    addToQueue(operation) {
      return new Promise((resolve, reject) => {
         // Basic validation of operation
         if (!operation.type || !operation.recordId) {
            console.error("[SaveQueue] Invalid operation added:", operation);
            return reject(new Error("Invalid save operation: missing type or recordId"));
         }

        const queuedOperation = {
          ...operation,
          resolve,
          reject,
          timestamp: new Date().toISOString()
        };
        this.queue.push(queuedOperation);
        console.log(`[SaveQueue] Added operation to queue: ${operation.type} for record ${operation.recordId}. Queue length: ${this.queue.length}`);
        this.processQueue(); // Attempt to process immediately
      });
    }

    // Processes the next operation in the queue if not already saving
    async processQueue() {
      if (this.isSaving || this.queue.length === 0) {
        // console.log(`[SaveQueue] Skipping processQueue. isSaving: ${this.isSaving}, Queue length: ${this.queue.length}`);
        return;
      }

      this.isSaving = true;
      const operation = this.queue[0]; // Get the first operation (FIFO)
      console.log(`[SaveQueue] Processing operation: ${operation.type} for record ${operation.recordId}`);

      try {
        const updateData = await this.prepareSaveData(operation);
        debugLog("[SaveQueue] Prepared update data", updateData);
        const response = await this.performSave(updateData, operation.recordId);
        debugLog("[SaveQueue] API Save successful", response);
        this.handleSaveSuccess(operation);
      } catch (error) {
         // Error should be the original error object from performSave or prepareSaveData
         console.error(`[SaveQueue] Error during processing for ${operation.type} (record ${operation.recordId}):`, error);
         this.handleSaveError(operation, error); // Pass the actual error object
      } finally {
          // Ensure isSaving is reset ONLY if the queue is empty or the next attempt failed immediately
           if (this.queue.length === 0 || !this.isSaving) { // Check isSaving again in case retry logic reset it
              this.isSaving = false;
              // console.log("[SaveQueue] Reset isSaving flag.");
           }
      }
    }

     // Prepares the final data payload for the Knack API PUT request
     async prepareSaveData(operation) {
         const { type, data, recordId, preserveFields } = operation;
         console.log(`[SaveQueue] Preparing save data for type: ${type}, record: ${recordId}, preserveFields: ${preserveFields}`);

         // Start with the mandatory lastSaved field
         const updateData = {
             [FIELD_MAPPING.lastSaved]: new Date().toISOString()
         };

         try {
              // Fetch existing data ONLY if preserving fields
             let existingData = null;
             if (preserveFields) {
                 console.log(`[SaveQueue] Preserving fields for ${type}, fetching existing data...`);
                 try {
                      existingData = await this.getExistingData(recordId);
                      debugLog("[SaveQueue] Fetched existing data for preservation", existingData ? `Record ${recordId} found` : `Record ${recordId} NOT found`);
                 } catch (fetchError) {
                      console.error(`[SaveQueue] Failed to fetch existing data for field preservation (record ${recordId}):`, fetchError);
                      // If fetch fails, we cannot reliably preserve. Should we fail the operation?
                      // Option 1: Fail the operation
                      // throw new Error(`Failed to fetch existing data for preservation: ${fetchError.message}`);
                      // Option 2: Proceed without preservation (potentially overwriting data)
                      console.warn("[SaveQueue] Proceeding with save WITHOUT field preservation due to fetch error.");
                      existingData = null; // Ensure existingData is null so preserve logic skips
                 }
             }

             // Add data based on operation type
             switch (type) {
                 case 'cards': // Only updates cardBankData
                     // IMPORTANT: This assumes 'cards' type means REPLACE cardBankData.
                     // If it means ADD/MERGE, the logic needs to be in the caller or here.
                     // For ADD_TO_BANK, the caller (handleAddToBankRequest) now prepares the full merged list.
                     updateData[FIELD_MAPPING.cardBankData] = JSON.stringify(
                         this.ensureSerializable(data || []) // data should be the full card array
                     );
                      console.log("[SaveQueue] Prepared cardBankData for 'cards' save.");
                     break;
                 case 'colors': // Only updates colorMapping
                     updateData[FIELD_MAPPING.colorMapping] = JSON.stringify(
                         this.ensureSerializable(data || {})
                     );
                     console.log("[SaveQueue] Prepared colorMapping for 'colors' save.");
                     break;
                 case 'topics': // Only updates topicLists
                     updateData[FIELD_MAPPING.topicLists] = JSON.stringify(
                         this.ensureSerializable(data || [])
                     );
                      console.log("[SaveQueue] Prepared topicLists for 'topics' save.");
                     break;
                 case 'full': // Includes all provided fields from the 'data' object
                      console.log("[SaveQueue] Preparing 'full' save data.");
                     // 'data' in a 'full' save should contain the keys like 'cards', 'colorMapping', etc.
                     Object.assign(updateData, this.prepareFullSaveData(data || {})); // Pass the data object itself
                     break;
                 default:
                      console.error(`[SaveQueue] Unknown save operation type: ${type}`);
                     throw new Error(`Unknown save operation type: ${type}`);
             }

             // If preserving fields and we successfully fetched existing data, merge
             if (preserveFields && existingData) {
                  console.log(`[SaveQueue] Merging prepared data with existing data for record ${recordId}`);
                 this.preserveExistingFields(updateData, existingData);
                 debugLog("[SaveQueue] Merged data after preservation", updateData);
             } else if (preserveFields && !existingData) {
                 console.warn(`[SaveQueue] Cannot preserve fields for record ${recordId} because existing data could not be fetched.`);
             }

             return updateData; // Return the final payload

         } catch (error) {
              console.error(`[SaveQueue] Error in prepareSaveData for type ${type}:`, error);
             throw error; // Re-throw the error to be caught by processQueue
         }
     }


    // Fetches current record data from Knack
    async getExistingData(recordId) {
       console.log(`[SaveQueue] Fetching existing data for record ${recordId}`);
       const apiCall = () => {
           return new Promise((resolve, reject) => {
               $.ajax({
                 url: `${KNACK_API_URL}/objects/${FLASHCARD_OBJECT}/records/${recordId}`,
                 type: 'GET',
                 headers: this.getKnackHeaders(), // Use headers method
                  data: { format: 'raw' }, // Request raw format if needed for connections
                 success: function(response) {
                   console.log(`[SaveQueue] Successfully fetched existing data for record ${recordId}`);
                   resolve(response);
                 },
                 error: function(jqXHR, textStatus, errorThrown) {
                    // Log more detailed error info
                    console.error(`[SaveQueue] Error fetching existing data for record ${recordId}: Status ${jqXHR.status} - ${errorThrown}`, jqXHR.responseText);
                    // Create a more informative error object
                    const error = new Error(`Failed to fetch record ${recordId}: ${jqXHR.status} ${errorThrown}`);
                    error.status = jqXHR.status;
                    error.responseText = jqXHR.responseText;
                    reject(error);
                 }
               });
           });
       };
       // Use retry mechanism for fetching, fail if retries exhausted
       return retryApiCall(apiCall);
    }


    // Merges updateData with existingData, preserving specific fields if they aren't explicitly included in updateData
    preserveExistingFields(updateData, existingData) {
        console.log(`[SaveQueue] Preserving fields for record. Fields in updateData: ${Object.keys(updateData).join(', ')}`);
       // Define all fields managed by the app that could be preserved
       const allAppFieldIds = [
          FIELD_MAPPING.cardBankData, FIELD_MAPPING.colorMapping, FIELD_MAPPING.topicLists,
          FIELD_MAPPING.topicMetadata, FIELD_MAPPING.box1Data, FIELD_MAPPING.box2Data,
          FIELD_MAPPING.box3Data, FIELD_MAPPING.box4Data, FIELD_MAPPING.box5Data
          // Add other fields here if the app manages them directly
       ];

       allAppFieldIds.forEach(fieldId => {
          // If the update payload *does not* already include this field,
          // but the existing record *does* have data for it, preserve it.
          if (updateData[fieldId] === undefined && existingData[fieldId] !== undefined && existingData[fieldId] !== null) {
             console.log(`[SaveQueue] Preserving existing data for field ID: ${fieldId}`);
             updateData[fieldId] = existingData[fieldId]; // Copy existing value
          }
       });
        // Note: lastSaved is always updated, so it's not preserved from existingData.
    }


    // Prepares the payload specifically for a 'full' save operation based on the input 'data' object
     prepareFullSaveData(data) {
         // 'data' should contain keys like 'cards', 'colorMapping', 'spacedRepetition', etc.
         const updatePayload = {};
         console.log("[SaveQueue] Preparing full save data from data object:", Object.keys(data));

         // Standardize and include card bank data if present in 'data'
         if (data.cards !== undefined) {
             console.log("[SaveQueue] Processing 'cards' for full save");
             let cardsToSave = data.cards || []; // Default to empty array if null/undefined
             cardsToSave = migrateTypeToQuestionType(cardsToSave); // Migrate legacy types
             cardsToSave = standardizeCards(cardsToSave); // Ensure standard structure
             updatePayload[FIELD_MAPPING.cardBankData] = JSON.stringify(
                 this.ensureSerializable(cardsToSave)
             );
             console.log(`[SaveQueue] Included ${cardsToSave.length} cards in full save payload.`);
         } else {
              console.log("[SaveQueue] 'cards' field missing in full save data object.");
         }

         if (data.colorMapping !== undefined) {
              console.log("[SaveQueue] Processing 'colorMapping' for full save");
             updatePayload[FIELD_MAPPING.colorMapping] = JSON.stringify(
                 this.ensureSerializable(data.colorMapping || {})
             );
         }

         if (data.topicLists !== undefined) {
              console.log("[SaveQueue] Processing 'topicLists' for full save");
             updatePayload[FIELD_MAPPING.topicLists] = JSON.stringify(
                 this.ensureSerializable(data.topicLists || [])
             );
         }

         // Include spaced repetition data if present in 'data'
         if (data.spacedRepetition !== undefined) {
              console.log("[SaveQueue] Processing 'spacedRepetition' for full save");
             const { box1, box2, box3, box4, box5 } = data.spacedRepetition || {}; // Default to empty object
             // Ensure boxes are arrays before stringifying
             if (box1 !== undefined) updatePayload[FIELD_MAPPING.box1Data] = JSON.stringify(this.ensureSerializable(box1 || []));
             if (box2 !== undefined) updatePayload[FIELD_MAPPING.box2Data] = JSON.stringify(this.ensureSerializable(box2 || []));
             if (box3 !== undefined) updatePayload[FIELD_MAPPING.box3Data] = JSON.stringify(this.ensureSerializable(box3 || []));
             if (box4 !== undefined) updatePayload[FIELD_MAPPING.box4Data] = JSON.stringify(this.ensureSerializable(box4 || []));
             if (box5 !== undefined) updatePayload[FIELD_MAPPING.box5Data] = JSON.stringify(this.ensureSerializable(box5 || []));
         }

          // Include topic metadata if present in 'data'
          if (data.topicMetadata !== undefined) {
               console.log("[SaveQueue] Processing 'topicMetadata' for full save");
              updatePayload[FIELD_MAPPING.topicMetadata] = JSON.stringify(
                  this.ensureSerializable(data.topicMetadata || [])
              );
          }


         return updatePayload; // Return only the fields provided in the 'data' object
     }


    // Performs the actual Knack API PUT request
    async performSave(updateData, recordId) {
       console.log(`[SaveQueue] Performing API save for record ${recordId}`);
       if (!recordId) {
           throw new Error("Cannot perform save: recordId is missing.");
       }
        if (Object.keys(updateData).length <= 1 && updateData[FIELD_MAPPING.lastSaved]) {
            console.warn(`[SaveQueue] Save payload for record ${recordId} only contains lastSaved timestamp. Skipping API call.`);
            return { message: "Save skipped, only timestamp update." }; // Return a success-like response
        }


       const apiCall = () => {
           return new Promise((resolve, reject) => {
               $.ajax({
                 url: `${KNACK_API_URL}/objects/${FLASHCARD_OBJECT}/records/${recordId}`,
                 type: 'PUT',
                 headers: this.getKnackHeaders(), // Use headers method
                 data: JSON.stringify(updateData), // Send prepared data
                 success: function(response) {
                    console.log(`[SaveQueue] API PUT successful for record ${recordId}`);
                    resolve(response);
                 },
                 error: function(jqXHR, textStatus, errorThrown) {
                     // Log more detailed error info
                    console.error(`[SaveQueue] API PUT failed for record ${recordId}: Status ${jqXHR.status} - ${errorThrown}`, jqXHR.responseText);
                     // Create a more informative error object
                    const error = new Error(`API Save failed for record ${recordId}: ${jqXHR.status} ${errorThrown}`);
                    error.status = jqXHR.status;
                    error.responseText = jqXHR.responseText;
                    reject(error); // Reject with the error object
                 }
               });
           });
       };
       // Use retry mechanism for saving, fail if retries exhausted
       return retryApiCall(apiCall);
    }


    // Handles successful save completion for an operation
    handleSaveSuccess(operation) {
      const completedOperation = this.queue.shift(); // Remove the completed operation
      if (completedOperation !== operation) {
          console.error("[SaveQueue] Mismatch between completed operation and head of queue!", operation, completedOperation);
          // Attempt recovery - find and remove the operation if possible
          const opIndex = this.queue.findIndex(op => op === operation);
          if(opIndex > -1) this.queue.splice(opIndex, 1);
      }
      this.retryAttempts.delete(operation); // Clear retry attempts for this operation
      console.log(`[SaveQueue] Operation ${operation.type} succeeded for record ${operation.recordId}. Queue length: ${this.queue.length}`);
      operation.resolve(true); // Resolve the promise associated with the operation
      this.isSaving = false; // Allow next operation
      this.processQueue(); // Process next item if any
    }

     // Handles save errors, implements retry logic
     handleSaveError(operation, error) {
         // Ensure operation is still at the head of the queue before retrying/failing
         if (this.queue[0] !== operation) {
            console.warn(`[SaveQueue] Stale error encountered for operation ${operation.type} (record ${operation.recordId}). Operation no longer at head of queue. Ignoring error.`);
             // We might not want to reset isSaving here if another operation is now processing
             // Check if another save is now in progress
             if (!this.isSaving && this.queue.length > 0) {
                 this.processQueue(); // Try processing the new head
             }
            return;
         }

         const attempts = (this.retryAttempts.get(operation) || 0) + 1; // Increment attempt count
         const errorMessage = error instanceof Error ? error.message : String(error);
         console.error(`[SaveQueue] Save error for ${operation.type} (record ${operation.recordId}, Attempt ${attempts}/${this.maxRetries}):`, errorMessage, error);

         if (attempts < this.maxRetries) {
             this.retryAttempts.set(operation, attempts);
             const delay = this.retryDelay * Math.pow(2, attempts - 1); // Exponential backoff
             console.log(`[SaveQueue] Retrying operation ${operation.type} (record ${operation.recordId}) in ${delay}ms...`);
             // IMPORTANT: Reset isSaving BEFORE the timeout to allow processing to restart
             this.isSaving = false;
             setTimeout(() => {
                 console.log(`[SaveQueue] Attempting retry for ${operation.type} (record ${operation.recordId}) after delay.`);
                 this.processQueue(); // Attempt to process the queue again
             }, delay);
         } else {
             console.error(`[SaveQueue] Max retries reached for operation ${operation.type} (record ${operation.recordId}). Aborting.`);
             const failedOperation = this.queue.shift(); // Remove the failed operation
             if (failedOperation !== operation) {
                 console.error("[SaveQueue] Mismatch during failure handling!", operation, failedOperation);
             }
             this.retryAttempts.delete(operation); // Clear retry attempts
             // Reject the promise with the last error
             operation.reject(error || new Error(`Save failed after ${this.maxRetries} retries`));
             this.isSaving = false; // Allow next operation
             this.processQueue(); // Process next item if any
         }
     }


    // Helper to get standard Knack API headers
    getKnackHeaders() {
      // Ensure Knack and getUserToken are available
       if (typeof Knack === 'undefined' || typeof Knack.getUserToken !== 'function') {
          console.error("[SaveQueue] Knack object or getUserToken function not available.");
          // Handle this scenario, maybe by rejecting operations immediately
          throw new Error("Knack authentication context not available.");
       }
       const token = Knack.getUserToken();
       if (!token) {
           console.warn("[SaveQueue] Knack user token is null or undefined. API calls may fail.");
            // Consider throwing an error if token is mandatory
            // throw new Error("Knack user token is missing.");
       }
      return {
        'X-Knack-Application-Id': knackAppId,
        'X-Knack-REST-API-Key': knackApiKey,
        'Authorization': token || '', // Send empty string if token is null
        'Content-Type': 'application/json'
      };
    }

    // Helper to ensure data is serializable (prevents circular references)
    ensureSerializable(data) {
      try {
        // Test serialization
        JSON.stringify(data);
        return data;
      } catch (e) {
        console.warn('[SaveQueue] Data contains circular references or non-serializable values. Stripping them.', e);
        const cache = new Set();
        try {
           return JSON.parse(JSON.stringify(data, (key, value) => {
             if (typeof value === 'object' && value !== null) {
               if (cache.has(value)) {
                 // Circular reference found, return undefined to omit key
                 return undefined; // Or return '[Circular]' string if preferred
               }
               // Store value in our collection
               cache.add(value);
             }
             return value;
           }));
        } catch (parseError) {
           console.error("[SaveQueue] Failed to serialize data even after attempting to strip circular references:", parseError);
           return data; // Return original data as a last resort
        }
      }
    }
  }

  // --- Create Singleton Instance ---
  const saveQueue = new SaveQueue();

  // --- Knack Integration Initialization ---
  $(document).on('knack-scene-render.scene_1206', function(event, scene) {
    console.log("Flashcard app: Scene rendered:", scene.key);
    initializeFlashcardApp();
  });

  // Initialize the React app
  function initializeFlashcardApp() {
    console.log("Initializing Flashcard React app (Version 5x with SaveQueue)");
    const config = FLASHCARD_APP_CONFIG['scene_1206']?.['view_3005']; // Use optional chaining

    if (!config) {
        console.error("Flashcard app: Configuration for scene_1206/view_3005 not found.");
        return;
    }


    // Check if user is authenticated
    if (typeof Knack === 'undefined' || !Knack.getUserToken) {
        console.error("Flashcard app: Knack context or getUserToken not available.");
        return; // Cannot proceed without Knack context
    }

    if (Knack.getUserToken()) {
      console.log("Flashcard app: User is authenticated");
      const userToken = Knack.getUserToken();
      const appId = Knack.application_id;
      const user = Knack.getUserAttributes();

      console.log("Flashcard app: Basic user info:", user);
      window.currentKnackUser = user; // Store basic info globally first

      // Get complete user data (async)
      getCompleteUserData(user.id, function(completeUserData) {
        if (completeUserData) {
            // Enhance global user object with complete data
          window.currentKnackUser = Object.assign({}, user, completeUserData);
          debugLog("Enhanced global user object", window.currentKnackUser);
        } else {
          console.warn("Flashcard app: Could not get complete user data, continuing with basic info");
        }
        // Proceed with initialization using the (potentially enhanced) global user object
        continueInitialization(config, userToken, appId);
      });

    } else {
      console.error("Flashcard app: User is not authenticated (Knack.getUserToken() returned null/false).");
       // Handle cases where user might be logged out or session expired
       // Maybe display a message or attempt re-login if applicable
    }
  }

   // Continue initialization after potentially fetching complete user data
   function continueInitialization(config, userToken, appId) {
       const currentUser = window.currentKnackUser; // Use the globally stored (potentially enhanced) user object

       // Extract and store connection field IDs safely
       currentUser.emailId = extractValidRecordId(currentUser.id); // User's own record ID
       currentUser.schoolId = extractValidRecordId(currentUser.school || currentUser.field_122); // Check both possible field names
       currentUser.tutorId = extractValidRecordId(currentUser.tutor);
       currentUser.roleId = extractValidRecordId(currentUser.role);

       debugLog("FINAL CONNECTION FIELD IDs", {
         emailId: currentUser.emailId,
         schoolId: currentUser.schoolId,
         tutorId: currentUser.tutorId,
         roleId: currentUser.roleId
       });

       // Find or create container for the app
        let container = document.querySelector(config.elementSelector);
        // Fallback selectors
        if (!container) container = document.querySelector('.kn-rich-text');
        if (!container) {
            const viewElement = document.getElementById('view_3005') || document.querySelector('.view_3005');
            if (viewElement) {
                console.log("Creating container inside view_3005");
                container = document.createElement('div');
                container.id = 'flashcard-app-container-generated';
                viewElement.appendChild(container);
            }
        }
        // Final fallback to scene
        if (!container) {
             const sceneElement = document.getElementById('kn-scene_1206');
             if (sceneElement) {
                 console.log("Creating container inside scene_1206");
                 container = document.createElement('div');
                 container.id = 'flashcard-app-container-generated';
                 sceneElement.appendChild(container);
             } else {
                 console.error("Flashcard app: Cannot find any suitable container for the app.");
                 return; // Stop if no container found
             }
        }


       container.innerHTML = ''; // Clear existing content

       // Loading indicator
       const loadingDiv = document.createElement('div');
       loadingDiv.id = 'flashcard-loading-indicator';
       loadingDiv.innerHTML = '<p>Loading Flashcard App...</p>';
        loadingDiv.style.padding = '20px';
        loadingDiv.style.textAlign = 'center';
       container.appendChild(loadingDiv);

       // Create iframe
       const iframe = document.createElement('iframe');
       iframe.id = 'flashcard-app-iframe';
       iframe.style.width = '100%';
       iframe.style.minHeight = '800px'; // Use min-height for flexibility
       iframe.style.border = 'none';
       iframe.style.display = 'none'; // Hide initially
       iframe.src = config.appUrl;
       container.appendChild(iframe);

        // --- Central Message Listener ---
        // Setup listener ONCE
        // Remove previous listener if re-initializing (though full page reload is more common)
       // window.removeEventListener('message', window.flashcardMessageHandler); // Remove old if exists

        const messageHandler = function(event) {
            // IMPORTANT: Check origin for security if appUrl is known and consistent
            // const expectedOrigin = new URL(config.appUrl).origin;
            // if (event.origin !== expectedOrigin) {
            //   console.warn("Ignoring message from unexpected origin:", event.origin, "Expected:", expectedOrigin);
            //   return;
            // }

            // Only accept messages from the created iframe's contentWindow
            if (event.source !== iframe.contentWindow) {
                // console.log("Ignoring message not from iframe source");
                return;
            }

            if (!event.data || !event.data.type) {
              console.warn("[Knack Script] Ignoring message with invalid format:", event.data);
              return;
            }

            const { type, data } = event.data;
            const iframeWindow = iframe.contentWindow; // Reference to the iframe's window

            // Log message receipt
            if (type !== 'PING') { // Avoid flooding logs with pings
                console.log(`[Knack Script] Received message type: ${type}`);
                // debugLog("[Knack Script] Message data:", data); // Optional: Log data for debugging
            }

            // Handle APP_READY separately to send initial data
             if (type === 'APP_READY') {
                 console.log("Flashcard app: React app reported APP_READY.");
                  // Double check if user object is ready
                  if (!window.currentKnackUser || !window.currentKnackUser.id) {
                      console.error("Cannot send initial info: Current Knack user data not ready.");
                      return;
                  }

                 loadingDiv.innerHTML = '<p>Loading User Data...</p>'; // Update loading message

                 loadFlashcardUserData(window.currentKnackUser.id, function(userData) {
                      // Ensure iframeWindow is still valid
                     if (iframeWindow && iframe.contentWindow === iframeWindow) { // Check if iframe still exists
                         const initialData = {
                             type: 'KNACK_USER_INFO',
                             data: {
                                 // Use the potentially enhanced currentUser from the outer scope
                                 id: window.currentKnackUser.id,
                                 email: window.currentKnackUser.email,
                                 name: window.currentKnackUser.name || '',
                                 token: userToken, // Pass the token obtained earlier
                                 appId: appId,     // Pass the appId obtained earlier
                                 userData: userData || {}, // Send loaded data or empty object
                                 // Send derived connection IDs too
                                 emailId: window.currentKnackUser.emailId,
                                 schoolId: window.currentKnackUser.schoolId,
                                 tutorId: window.currentKnackUser.tutorId,
                                 roleId: window.currentKnackUser.roleId
                             }
                         };
                         debugLog("--> Sending KNACK_USER_INFO to React App", initialData.data);
                         iframeWindow.postMessage(initialData, '*'); // Target specific iframe window

                         // Show iframe after sending initial data
                         loadingDiv.style.display = 'none';
                         iframe.style.display = 'block';
                          console.log("Flashcard app initialized and visible.");
                     } else {
                          console.warn("[Knack Script] Iframe window no longer valid when sending initial data.");
                     }
                 });
             } else {
                // Delegate other messages to the central handler, passing iframeWindow
                handleMessageRouter(type, data, iframeWindow);
             }
       };

       window.addEventListener('message', messageHandler);
       // Store handler reference if needed for removal later: window.flashcardMessageHandler = messageHandler;

       console.log("Flashcard app initialization sequence complete. Waiting for APP_READY from iframe.");
   }


  // --- Central Message Router ---
  // Routes messages received from the React app iframe to specific handlers
  function handleMessageRouter(type, data, iframeWindow) { // Renamed from handleMessage to avoid conflict
    // Basic validation
    if (!type) {
        console.warn("[Knack Script] Received message without type.");
        return;
    }
     if (!iframeWindow) {
         console.error("[Knack Script] iframeWindow is missing in handleMessageRouter. Cannot send response.");
         return;
     }


    console.log(`[Knack Script] Routing message type: ${type}`);

    switch (type) {
      case 'SAVE_DATA':
        handleSaveDataRequest(data, iframeWindow); // Pass iframeWindow
        break;
      case 'ADD_TO_BANK':
        handleAddToBankRequest(data, iframeWindow); // Pass iframeWindow
        break;
      case 'TOPIC_LISTS_UPDATED':
        handleTopicListsUpdatedRequest(data, iframeWindow); // Pass iframeWindow
        break;
      case 'REQUEST_TOKEN_REFRESH':
         handleTokenRefresh(iframeWindow); // Pass iframeWindow
         break;
      case 'RELOAD_APP_DATA':
         handleReloadRequest(data, iframeWindow); // Pass iframeWindow
         break;
      case 'REQUEST_UPDATED_DATA':
         handleDataUpdateRequest(data, iframeWindow); // Pass iframeWindow
         break;
       case 'AUTH_CONFIRMED': // React confirms it received auth
           console.log("[Knack Script] React App confirmed auth.");
           // Could hide loading indicator here if it wasn't already hidden
           const loadingIndicator = document.getElementById('flashcard-loading-indicator');
            if (loadingIndicator) loadingIndicator.style.display = 'none';
            const appIframe = document.getElementById('flashcard-app-iframe');
            if (appIframe) appIframe.style.display = 'block';
           break;
       case 'REQUEST_RECORD_ID':
           handleRecordIdRequest(data, iframeWindow); // Pass iframeWindow
           break;
      // Add other cases for messages from React app as needed
      default:
        console.warn(`[Knack Script] Unhandled message type: ${type}`);
    }
  }


  // --- Specific Message Handlers (Using Save Queue & Correct PostMessage Target) ---

  // Handles 'SAVE_DATA' request from React app
  async function handleSaveDataRequest(data, iframeWindow) {
    console.log("[Knack Script] Handling SAVE_DATA request");
    if (!data || !data.recordId) {
        console.error("[Knack Script] SAVE_DATA request missing recordId.");
         // CORRECTION: Target iframeWindow for response
        if (iframeWindow) iframeWindow.postMessage({ type: 'SAVE_RESULT', success: false, error: "Missing recordId" }, '*');
        return;
    }
    debugLog("[Knack Script] Data received for SAVE_DATA:", data);

    try {
      // Add the 'full' save operation to the queue
      await saveQueue.addToQueue({
        type: 'full',
        data: data, // Pass the whole data object received
        recordId: data.recordId,
        preserveFields: data.preserveFields || false // Default preserveFields to false if not provided
      });

      console.log(`[Knack Script] SAVE_DATA for record ${data.recordId} completed successfully.`);
      // CORRECTION: Target iframeWindow for response
      if (iframeWindow) iframeWindow.postMessage({ type: 'SAVE_RESULT', success: true, timestamp: new Date().toISOString() }, '*');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[Knack Script] SAVE_DATA failed for record ${data.recordId}:`, errorMessage);
      // CORRECTION: Target iframeWindow for response
      if (iframeWindow) iframeWindow.postMessage({ type: 'SAVE_RESULT', success: false, error: errorMessage || 'Unknown save error' }, '*');
    }
  }

  // Handles 'ADD_TO_BANK' request from React app
  async function handleAddToBankRequest(data, iframeWindow) {
    console.log("[Knack Script] Handling ADD_TO_BANK request");
     if (!data || !data.recordId || !data.cards) {
         console.error("[Knack Script] ADD_TO_BANK request missing recordId or cards.");
          // CORRECTION: Target iframeWindow for response
         if (iframeWindow) iframeWindow.postMessage({ type: 'ADD_TO_BANK_RESULT', success: false, error: "Missing recordId or cards" }, '*');
         return;
     }
     debugLog("[Knack Script] Data received for ADD_TO_BANK:", data);

     // --- Merge with existing card bank data BEFORE queuing ---
     try {
         console.log(`[Knack Script] Fetching existing data before ADD_TO_BANK for record ${data.recordId}`);
         const existingData = await saveQueue.getExistingData(data.recordId); // Use SaveQueue's fetcher

          // Standardize the NEW cards first
         const newCardsStandardized = standardizeCards(data.cards || []);
         const newCardCount = newCardsStandardized.length;
          if (newCardCount === 0) {
               console.log("[Knack Script] No valid new cards to add.");
                if (iframeWindow) iframeWindow.postMessage({ type: 'ADD_TO_BANK_RESULT', success: true, shouldReload: false, message: "No new cards to add." }, '*');
                return; // Nothing to do
          }


         // Parse existing card bank
         let existingItems = [];
         if (existingData && existingData[FIELD_MAPPING.cardBankData]) {
             try {
                 let bankDataStr = existingData[FIELD_MAPPING.cardBankData];
                  if (typeof bankDataStr === 'string' && bankDataStr.includes('%')) {
                     bankDataStr = safeDecodeURIComponent(bankDataStr);
                  }
                 existingItems = safeParseJSON(bankDataStr, []); // Default to empty array on parse failure
             } catch (parseError) {
                 console.error("[Knack Script] Error parsing existing card bank data for ADD_TO_BANK:", parseError);
                 existingItems = []; // Start fresh if parsing fails critically
             }
         }

         // Split existing into shells and cards
         const { topics: existingTopicShells, cards: existingCards } = splitByType(existingItems);

         // Deduplicate: Ensure new cards aren't already in existing cards
         const existingCardIds = new Set(existingCards.map(c => c.id));
         const cardsToAdd = newCardsStandardized.filter(nc => !existingCardIds.has(nc.id));
         const skippedCount = newCardCount - cardsToAdd.length;
         if (skippedCount > 0) {
             console.log(`[Knack Script] Skipped ${skippedCount} cards already present in the bank.`);
         }
          if (cardsToAdd.length === 0) {
               console.log("[Knack Script] All new cards were duplicates or invalid.");
                if (iframeWindow) iframeWindow.postMessage({ type: 'ADD_TO_BANK_RESULT', success: true, shouldReload: false, message: "All submitted cards already exist." }, '*');
                return; // Nothing to add
          }


         // Combine existing shells/cards with the NEW, deduplicated cards
         const finalBankData = [...existingTopicShells, ...existingCards, ...cardsToAdd];
         console.log(`[Knack Script] Merged ${cardsToAdd.length} new cards with ${existingCards.length} existing cards and ${existingTopicShells.length} shells.`);

         // --- Prepare Box 1 Update ---
          let box1Data = [];
          if (existingData && existingData[FIELD_MAPPING.box1Data]) {
             try {
                 let box1String = existingData[FIELD_MAPPING.box1Data];
                 if (typeof box1String === 'string' && box1String.includes('%')) {
                     box1String = safeDecodeURIComponent(box1String);
                 }
                 box1Data = safeParseJSON(box1String, []); // Default to empty array
             } catch(parseError) {
                console.error("[Knack Script] Error parsing Box 1 data:", parseError);
                box1Data = [];
             }
          }

          const now = new Date().toISOString();
          const existingBox1Map = new Map(box1Data.map(entry => [entry.cardId, true]));
          // Add ONLY the newly added cards to Box 1
          const newBox1Entries = cardsToAdd
            .filter(card => card.id && !existingBox1Map.has(card.id))
            .map(card => ({ cardId: card.id, lastReviewed: now, nextReviewDate: now }));

          const updatedBox1 = [...box1Data, ...newBox1Entries];
          console.log(`[Knack Script] Added ${newBox1Entries.length} new entries to Box 1.`);

         // --- Queue a 'full' save operation with merged data ---
         const fullSaveData = {
             // We are providing the specific fields to update within the 'data' object for the 'full' type
             cards: finalBankData, // The fully merged card bank
             spacedRepetition: { // Include the updated Box 1
                 box1: updatedBox1
                 // Other boxes will be preserved because preserveFields is true
             }
             // Other fields like colorMapping, topicLists will be preserved from existingData
         };

         await saveQueue.addToQueue({
           type: 'full',
           data: fullSaveData, // Pass the prepared data object containing 'cards' and 'spacedRepetition'
           recordId: data.recordId,
           preserveFields: true // CRITICAL: ensure other fields (colors, topics, other boxes) are preserved
         });

         console.log(`[Knack Script] ADD_TO_BANK for record ${data.recordId} completed successfully.`);
         // CORRECTION: Target iframeWindow for response
         if (iframeWindow) iframeWindow.postMessage({ type: 'ADD_TO_BANK_RESULT', success: true, shouldReload: true }, '*'); // Signal reload might be needed

     } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
         console.error(`[Knack Script] ADD_TO_BANK failed during data preparation or queuing for record ${data.recordId}:`, errorMessage, error);
         // CORRECTION: Target iframeWindow for response
         if (iframeWindow) iframeWindow.postMessage({ type: 'ADD_TO_BANK_RESULT', success: false, error: errorMessage || 'Unknown add to bank error' }, '*');
     }
  }


  // Handles 'TOPIC_LISTS_UPDATED' request from React app
  async function handleTopicListsUpdatedRequest(data, iframeWindow) {
     console.log("[Knack Script] Handling TOPIC_LISTS_UPDATED request");
      if (!data || !data.recordId || !data.topicLists) {
          console.error("[Knack Script] TOPIC_LISTS_UPDATED request missing recordId or topicLists.");
           // CORRECTION: Target iframeWindow for response
          if (iframeWindow) iframeWindow.postMessage({ type: 'TOPIC_LISTS_UPDATE_RESULT', success: false, error: "Missing recordId or topicLists" }, '*');
          return;
      }
      debugLog("[Knack Script] Data received for TOPIC_LISTS_UPDATED:", data);

      try {
         // Step 1: Save the topicLists data itself using the queue
         console.log(`[Knack Script] Queuing save for topicLists field (${FIELD_MAPPING.topicLists}) for record ${data.recordId}`);
         await saveQueue.addToQueue({
            type: 'topics', // Specific type for saving just the topic lists field
            data: data.topicLists, // The array of topic lists
            recordId: data.recordId,
            preserveFields: true // Preserve other fields like card bank, colors etc.
         });
         console.log(`[Knack Script] Successfully queued save for topicLists for record ${data.recordId}.`);

         // Step 2: Trigger topic shell creation/update based on the *just saved* lists.
         console.log(`[Knack Script] Triggering topic shell creation/update based on updated lists for record ${data.recordId}.`);
         // This function handles fetching existing data, generating/merging shells, and queuing the final save.
         await createTopicShellsFromLists(data.topicLists, data.recordId, iframeWindow); // Pass iframeWindow for potential feedback within shell creation

         console.log(`[Knack Script] TOPIC_LISTS_UPDATED for record ${data.recordId} processed.`);
         // Notify React app - Success here means the process was *initiated* successfully
          // CORRECTION: Target iframeWindow for response
         if (iframeWindow) iframeWindow.postMessage({ type: 'TOPIC_LISTS_UPDATE_RESULT', success: true, timestamp: new Date().toISOString() }, '*');

      } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
         console.error(`[Knack Script] TOPIC_LISTS_UPDATED failed for record ${data.recordId}:`, errorMessage, error);
         // CORRECTION: Target iframeWindow for response
         if (iframeWindow) iframeWindow.postMessage({ type: 'TOPIC_LISTS_UPDATE_RESULT', success: false, error: errorMessage || 'Unknown topic list update error' }, '*');
      }
  }

   // Handle RELOAD_APP_DATA request
   async function handleReloadRequest(data, iframeWindow) {
       console.log("[Knack Script] Handling RELOAD_APP_DATA request");
       const userId = window.currentKnackUser?.id;
       if (!userId) {
           console.error("[Knack Script] Cannot reload data - user ID not found.");
           if (iframeWindow) iframeWindow.postMessage({ type: 'DATA_REFRESH_ERROR', error: 'User ID not found' }, '*');
           return;
       }

       loadFlashcardUserData(userId, function(userData) {
           // CORRECTION: Target iframeWindow for response
           if (userData && iframeWindow) {
               console.log("[Knack Script] Sending refreshed data to React app (on reload request)");
               iframeWindow.postMessage({
                   type: 'KNACK_DATA', // Send as KNACK_DATA type
                   cards: userData.cards || [],
                   colorMapping: userData.colorMapping || {},
                   topicLists: userData.topicLists || [],
                   topicMetadata: userData.topicMetadata || [], // Include metadata if loaded
                   spacedRepetition: userData.spacedRepetition || {}, // Include SR data
                   recordId: userData.recordId,
                   auth: { id: userId, email: window.currentKnackUser?.email, name: window.currentKnackUser?.name || '' },
                   timestamp: new Date().toISOString()
               }, '*');
           } else if (iframeWindow) {
               console.error("[Knack Script] Error loading updated data for reload");
               iframeWindow.postMessage({ type: 'DATA_REFRESH_ERROR', error: 'Failed to load data for reload' }, '*');
           }
       });
   }

    // Handle REQUEST_UPDATED_DATA request
    async function handleDataUpdateRequest(data, iframeWindow) {
        console.log("[Knack Script] Handling REQUEST_UPDATED_DATA request");
        const userId = window.currentKnackUser?.id;
        const recordId = data?.recordId; // Get recordId from message

        if (!userId) {
            console.error("[Knack Script] Cannot refresh data - user ID not found.");
             // CORRECTION: Target iframeWindow for response
            if (iframeWindow) iframeWindow.postMessage({ type: 'DATA_REFRESH_ERROR', error: 'User ID not found' }, '*');
            return;
        }
         if (!recordId) {
             console.error("[Knack Script] Cannot refresh data - missing record ID in request");
              // CORRECTION: Target iframeWindow for response
             if (iframeWindow) iframeWindow.postMessage({ type: 'DATA_REFRESH_ERROR', error: 'Missing record ID in request' }, '*');
             return;
         }

        // Use loadFlashcardUserData which inherently gets the latest for that user
        loadFlashcardUserData(userId, function(userData) {
             // CORRECTION: Target iframeWindow for response
            if (userData && iframeWindow) {
                // Ensure the loaded data corresponds to the requested recordId
                if (userData.recordId === recordId) {
                   console.log("[Knack Script] Sending refreshed data to React app (on request)");
                   iframeWindow.postMessage({
                       type: 'KNACK_DATA',
                       cards: userData.cards || [],
                       colorMapping: userData.colorMapping || {},
                       topicLists: userData.topicLists || [],
                       topicMetadata: userData.topicMetadata || [], // Include metadata
                       spacedRepetition: userData.spacedRepetition || {}, // Include SR data
                       recordId: userData.recordId, // Send the confirmed recordId
                       auth: { id: userId, email: window.currentKnackUser?.email, name: window.currentKnackUser?.name || '' },
                       timestamp: new Date().toISOString()
                   }, '*');
                } else {
                   // This case should be rare if the React app correctly maintains the recordId
                   console.warn(`[Knack Script] Loaded data record ID (${userData.recordId}) does not match requested record ID (${recordId}). This might indicate an issue. Sending loaded data anyway.`);
                    iframeWindow.postMessage({
                       type: 'KNACK_DATA', // Still send data
                       cards: userData.cards || [],
                       colorMapping: userData.colorMapping || {},
                       topicLists: userData.topicLists || [],
                       topicMetadata: userData.topicMetadata || [],
                        spacedRepetition: userData.spacedRepetition || {},
                       recordId: userData.recordId, // Send the actual loaded recordId
                       auth: { id: userId, email: window.currentKnackUser?.email, name: window.currentKnackUser?.name || '' },
                       timestamp: new Date().toISOString()
                   }, '*');
                }
            } else if (iframeWindow) {
                console.error("[Knack Script] Error loading updated data (on request)");
                iframeWindow.postMessage({ type: 'DATA_REFRESH_ERROR', error: 'Failed to load data' }, '*');
            }
        });
    }

     // Handle REQUEST_RECORD_ID request
     async function handleRecordIdRequest(data, iframeWindow) {
         console.log("[Knack Script] Handling REQUEST_RECORD_ID request");
         const userId = window.currentKnackUser?.id;
         if (!userId) {
             console.error("[Knack Script] Cannot get record ID - user ID not found.");
              // CORRECTION: Target iframeWindow for response
              if (iframeWindow) iframeWindow.postMessage({ type: 'RECORD_ID_ERROR', error: 'User ID not found' }, '*'); // Removed backslash before closing quote
             return;
         }

         // Use loadFlashcardUserData to find the record ID associated with the current user
         loadFlashcardUserData(userId, function(userData) {
              // CORRECTION: Target iframeWindow for response
             if (userData && userData.recordId && iframeWindow) {
                 console.log(`[Knack Script] Found record ID: ${userData.recordId}`);
                 iframeWindow.postMessage({
                     type: 'RECORD_ID_RESPONSE',
                     recordId: userData.recordId,
                     timestamp: new Date().toISOString()
                 }, '*');
             } else if (iframeWindow) {
                 console.error(`[Knack Script] Could not find record ID for user ${userId}`);
                 iframeWindow.postMessage({
                     type: 'RECORD_ID_ERROR',
                     error: 'Record ID not found',
                     timestamp: new Date().toISOString()
                 }, '*');
             }
         });
     }


  // --- Data Loading and Utility Functions (Adapted from 5w) ---

  // Get complete user data from Knack (Object_3)
  function getCompleteUserData(userId, callback) {
    console.log("[Knack Script] Getting complete user data for:", userId);
    const apiCall = () => new Promise((resolve, reject) => {
        $.ajax({
            url: `${KNACK_API_URL}/objects/object_3/records/${userId}`, // Assuming object_3 is user object
            type: 'GET',
            headers: saveQueue.getKnackHeaders(), // Use headers method from SaveQueue instance
             data: { format: 'raw' }, // Request raw format
            success: resolve,
            error: reject // Let retryApiCall handle error details
        });
    });

    retryApiCall(apiCall)
        .then(response => {
            console.log("[Knack Script] Complete user data received.");
            debugLog("[Knack Script] Raw Complete User Data:", response);
            callback(response); // Pass raw response
        })
        .catch(error => {
            console.error("[Knack Script] Error retrieving complete user data:", error);
            callback(null); // Indicate failure
        });
  }

   // Load user's flashcard data (Object_102)
   function loadFlashcardUserData(userId, callback) {
       console.log(`[Knack Script] Loading flashcard user data for user ID: ${userId}`);
       const findRecordApiCall = () => new Promise((resolve, reject) => {
           $.ajax({
               url: `${KNACK_API_URL}/objects/${FLASHCARD_OBJECT}/records`,
               type: 'GET',
               headers: saveQueue.getKnackHeaders(), // Use headers from queue instance
               data: {
                   format: 'raw', // Important: Use raw format
                   filters: JSON.stringify({
                       match: 'and',
                       rules: [{ field: FIELD_MAPPING.userId, operator: 'is', value: userId }]
                   })
               },
               success: resolve,
               error: reject // Let retry handle failures
           });
       });

       retryApiCall(findRecordApiCall)
         .then((response) => {
           debugLog("[Knack Script] Flashcard User data search response:", response);
           if (response && response.records && response.records.length > 0) {
             const record = response.records[0];
             console.log(`[Knack Script] Found existing flashcard record: ${record.id}`);
             // debugLog("[Knack Script] RAW flashcard record data:", record);

             // --- Assemble userData from record fields safely ---
             let userData = { recordId: record.id };
             try {
                 // Helper to parse potentially encoded fields
                 const parseField = (fieldName) => {
                    const rawValue = record[fieldName];
                    if (rawValue === undefined || rawValue === null) return null;
                    // Decode only if it's a string and contains '%'
                    const decodedValue = (typeof rawValue === 'string' && rawValue.includes('%'))
                         ? safeDecodeURIComponent(rawValue)
                         : rawValue;
                    // Parse if it's potentially JSON (string starting with { or [)
                     if (typeof decodedValue === 'string' && (decodedValue.startsWith('{') || decodedValue.startsWith('['))) {
                         return safeParseJSON(decodedValue);
                     }
                     // Return decoded value otherwise (might be plain string, number etc.)
                     return decodedValue;
                 };


                 userData.cards = parseField(FIELD_MAPPING.cardBankData) || [];
                 userData.cards = migrateTypeToQuestionType(userData.cards); // Migrate legacy types
                 userData.cards = standardizeCards(userData.cards); // Standardize structure
                 console.log(`[Knack Script] Loaded ${userData.cards.length} cards/shells from bank.`);

                 userData.spacedRepetition = {};
                 for (let i = 1; i <= 5; i++) {
                     const fieldKey = FIELD_MAPPING[`box${i}Data`];
                     userData.spacedRepetition[`box${i}`] = parseField(fieldKey) || [];
                 }
                 console.log(`[Knack Script] Loaded spaced repetition data.`);

                 userData.topicLists = parseField(FIELD_MAPPING.topicLists) || [];
                 console.log(`[Knack Script] Loaded ${userData.topicLists.length} topic lists.`);

                 userData.colorMapping = parseField(FIELD_MAPPING.colorMapping) || {};
                 console.log(`[Knack Script] Loaded color mapping.`);

                 userData.topicMetadata = parseField(FIELD_MAPPING.topicMetadata) || [];
                 console.log(`[Knack Script] Loaded ${userData.topicMetadata.length} topic metadata items.`);

                 // Add lastSaved timestamp if needed
                 userData.lastSaved = record[FIELD_MAPPING.lastSaved];


                 debugLog("[Knack Script] ASSEMBLED USER DATA from loaded record", userData);
                 callback(userData);

             } catch (e) {
               console.error("[Knack Script] Error parsing loaded user data fields:", e);
               // Return partially assembled data or fallback
               callback(userData); // Return whatever was parsed successfully before the error
             }

           } else {
             // No existing data, create a new record
             console.log(`[Knack Script] No existing flashcard record found for user ${userId}, creating new one...`);
             createFlashcardUserRecord(userId, function(success, newRecordId) {
               if (success && newRecordId) {
                  console.log(`[Knack Script] New record created with ID: ${newRecordId}`);
                 // Return the default empty structure with the new record ID
                 callback({
                   recordId: newRecordId,
                   cards: [],
                   spacedRepetition: { box1: [], box2: [], box3: [], box4: [], box5: [] },
                   topicLists: [],
                   topicMetadata: [],
                   colorMapping: {}
                 });
               } else {
                   console.error(`[Knack Script] Failed to create new flashcard record for user ${userId}.`);
                 callback(null); // Indicate failure to load/create data
               }
             });
           }
         })
         .catch((error) => {
           console.error("[Knack Script] Error loading flashcard user data after retries:", error);
           callback(null); // Indicate failure
         });
   }

   // Create a new flashcard user record in Object_102
   function createFlashcardUserRecord(userId, callback) {
       console.log("[Knack Script] Creating new flashcard user record for:", userId);
       const user = window.currentKnackUser; // Assumes global user object is populated

        if (!user) {
            console.error("[Knack Script] Cannot create record: window.currentKnackUser is not defined.");
            callback(false, null);
            return;
        }


       // Basic data structure for a new record
       const data = {
           [FIELD_MAPPING.userId]: userId, // Link to the user ID (text field)
           [FIELD_MAPPING.userEmail]: sanitizeField(user.email),
           [FIELD_MAPPING.userName]: sanitizeField(user.name || ""),
           [FIELD_MAPPING.lastSaved]: new Date().toISOString(),
           // Initialize JSON fields as empty arrays/objects
           [FIELD_MAPPING.cardBankData]: JSON.stringify([]),
           [FIELD_MAPPING.box1Data]: JSON.stringify([]),
           [FIELD_MAPPING.box2Data]: JSON.stringify([]),
           [FIELD_MAPPING.box3Data]: JSON.stringify([]),
           [FIELD_MAPPING.box4Data]: JSON.stringify([]),
           [FIELD_MAPPING.box5Data]: JSON.stringify([]),
           [FIELD_MAPPING.colorMapping]: JSON.stringify({}),
           [FIELD_MAPPING.topicLists]: JSON.stringify([]),
           [FIELD_MAPPING.topicMetadata]: JSON.stringify([])
       };

       // Add connection fields ONLY if valid IDs exist on the currentUser object
       // These IDs should have been derived during initialization
       if (window.currentKnackUser.emailId) data[FIELD_MAPPING.accountConnection] = window.currentKnackUser.emailId; // Connection to Account/User Object
       if (window.currentKnackUser.schoolId) data[FIELD_MAPPING.vespaCustomer] = window.currentKnackUser.schoolId; // Connection to School/Customer Object
       if (window.currentKnackUser.tutorId) data[FIELD_MAPPING.tutorConnection] = window.currentKnackUser.tutorId; // Connection to Tutor Object
       if (window.currentKnackUser.roleId) data[FIELD_MAPPING.userRole] = window.currentKnackUser.roleId; // Connection to Role Object

       // Add other user attributes if available and relevant fields exist
       if (user.tutorGroup && FIELD_MAPPING.tutorGroup) data[FIELD_MAPPING.tutorGroup] = sanitizeField(user.tutorGroup);
       if (user.yearGroup && FIELD_MAPPING.yearGroup) data[FIELD_MAPPING.yearGroup] = sanitizeField(user.yearGroup);


       debugLog("[Knack Script] CREATING NEW RECORD PAYLOAD", data);

       const apiCall = () => new Promise((resolve, reject) => {
          $.ajax({
             url: `${KNACK_API_URL}/objects/${FLASHCARD_OBJECT}/records`,
             type: 'POST',
             headers: saveQueue.getKnackHeaders(), // Use headers from queue
             data: JSON.stringify(data),
             success: resolve,
             error: reject // Let retry handle details
          });
       });

       retryApiCall(apiCall)
          .then(response => {
             console.log("[Knack Script] Successfully created user record:", response);
             callback(true, response.id); // Pass success and the new record ID
          })
          .catch(error => {
             console.error("[Knack Script] Error creating user record:", error);
             callback(false, null); // Pass failure
          });
   }


   // Standardize card data before saving or processing
   function standardizeCards(cards) {
       if (!Array.isArray(cards)) {
            console.warn("[Knack Script] standardizeCards called with non-array:", cards);
           return [];
       }
       return cards.map(card => {
           if (!card || typeof card !== 'object') {
                console.warn("[Knack Script] Skipping invalid item in cards array:", card);
               return null; // Handle null/undefined/non-object entries
           }
           try {
               // Deep clone via serialization to avoid modifying original & handle complex objects
               let cleanCard = saveQueue.ensureSerializable(card); // Use queue's helper

                // Define default structure
               let standardCard = {
                 id: cleanCard.id || `card_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,
                 subject: sanitizeField(cleanCard.subject || 'General'),
                 topic: sanitizeField(cleanCard.topic || 'General'),
                 examBoard: sanitizeField(cleanCard.examBoard || ''),
                 examType: sanitizeField(cleanCard.examType || ''),
                 topicPriority: parseInt(cleanCard.topicPriority || 0, 10), // Ensure number
                 question: sanitizeField(cleanCard.question || cleanCard.front || ''),
                 answer: sanitizeField(cleanCard.answer || cleanCard.back || ''), // Sanitize potentially complex answers
                 keyPoints: Array.isArray(cleanCard.keyPoints) ? cleanCard.keyPoints.map(kp => sanitizeField(kp)) : [],
                 detailedAnswer: sanitizeField(cleanCard.detailedAnswer || ''),
                 additionalInfo: sanitizeField(cleanCard.additionalInfo || cleanCard.notes || ''),
                 cardColor: cleanCard.cardColor || cleanCard.color || '#cccccc', // Default grey
                 subjectColor: cleanCard.subjectColor || '', // Add subjectColor field
                 textColor: cleanCard.textColor || '',
                 boxNum: cleanCard.boxNum ? parseInt(cleanCard.boxNum, 10) : 1, // Ensure number, default 1
                 lastReviewed: cleanCard.lastReviewed || null, // Keep null if not set
                 nextReviewDate: cleanCard.nextReviewDate || new Date(Date.now() + 86400000).toISOString(), // Default +1 day
                 createdAt: cleanCard.createdAt || new Date().toISOString(),
                 updatedAt: new Date().toISOString(), // Always update timestamp
                 options: Array.isArray(cleanCard.options) ? cleanCard.options : [], // Ensure array
                 savedOptions: Array.isArray(cleanCard.savedOptions) ? cleanCard.savedOptions : [], // Ensure array
                 questionType: cleanCard.questionType || 'short_answer', // Default type
                 type: cleanCard.type || 'card' // Ensure type field exists ('card' or 'topic')
               };

               // Specific handling for 'topic' type (shells)
               if (standardCard.type === 'topic' || cleanCard.isShell === true) { // Check isShell flag too
                   standardCard.type = 'topic';
                   standardCard.name = sanitizeField(cleanCard.name || standardCard.topic); // Ensure name exists and is clean
                   standardCard.isShell = true;
                    // Determine isEmpty based on whether a 'cards' array exists and is empty
                   standardCard.isEmpty = !Array.isArray(cleanCard.cards) || cleanCard.cards.length === 0;
                   // Clear fields not relevant to topic shells
                   standardCard.question = '';
                   standardCard.answer = '';
                    standardCard.keyPoints = [];
                    standardCard.detailedAnswer = '';
                    standardCard.additionalInfo = '';
                   standardCard.boxNum = undefined; // Or null
                   standardCard.lastReviewed = undefined; // Or null
                   standardCard.nextReviewDate = undefined; // Or null
                   standardCard.questionType = undefined; // Or null
                    standardCard.options = [];
                    standardCard.savedOptions = [];
               } else {
                  // Ensure type is 'card' for actual flashcards
                  standardCard.type = 'card';
                   // Remove shell-specific flags if they accidentally ended up on a card
                   delete standardCard.isShell;
                   delete standardCard.isEmpty;
                   delete standardCard.name; // Cards use question/answer, not name
               }


               // Multiple Choice Handling (after type is determined)
                if (standardCard.type === 'card') { // Only apply MC logic to cards
                    const isMC = isMultipleChoiceCard(standardCard);
                    if (isMC) {
                        standardCard.questionType = 'multiple_choice';
                        // Restore or create options if missing
                        if (!standardCard.options || standardCard.options.length === 0) {
                            if (standardCard.savedOptions && standardCard.savedOptions.length > 0) {
                                 console.log(`[Standardize] Restoring options from savedOptions for card ${standardCard.id}`);
                                standardCard.options = [...standardCard.savedOptions];
                            }
                            // Optionally add logic here to extract from answer if needed as ultimate fallback
                        }
                        // Backup options if they exist and differ from savedOptions
                        if (standardCard.options && standardCard.options.length > 0) {
                            // Basic check to avoid redundant saving if they are identical
                             try {
                                 if (JSON.stringify(standardCard.options) !== JSON.stringify(standardCard.savedOptions)) {
                                      console.log(`[Standardize] Backing up options to savedOptions for card ${standardCard.id}`);
                                     standardCard.savedOptions = [...standardCard.options];
                                 }
                             } catch (e) {
                                  console.warn(`[Standardize] Error comparing options for backup on card ${standardCard.id}`, e);
                                 // Save anyway if comparison fails
                                 standardCard.savedOptions = [...standardCard.options];
                             }
                        }
                         // Ensure options have required structure (e.g., { text: '...', isCorrect: Boolean(...) })
                         standardCard.options = standardCard.options.map(opt => ({
                             text: sanitizeField(opt.text || ''), // Sanitize option text
                             isCorrect: Boolean(opt.isCorrect)   // Ensure boolean
                         }));

                    } else { // If not MC, ensure questionType is appropriate
                       standardCard.questionType = standardCard.questionType === 'multiple_choice' ? 'short_answer' : standardCard.questionType; // Reset if wrongly marked MC
                        // Clear options if it's not an MC card
                        standardCard.options = [];
                        standardCard.savedOptions = [];
                    }
                }


               return standardCard;

           } catch (error) {
               console.error("[Knack Script] Error standardizing card:", error, "Card data:", card);
               return null; // Return null for cards that cause errors during standardization
           }
       }).filter(card => card !== null); // Filter out any null results from errors
   }


   // Detect if a card should be multiple choice
   function isMultipleChoiceCard(card) {
     // Check object exists and is a card
     if (!card || typeof card !== 'object' || card.type !== 'card') return false;

     // Explicit type check first
     if (card.questionType === 'multiple_choice') return true;

     // Presence of valid options array (at least one option)
     if (Array.isArray(card.options) && card.options.length > 0) {
        // Optional: Check if options have the expected structure (text, isCorrect)
         if (card.options.some(opt => opt && typeof opt.text === 'string' && typeof opt.isCorrect === 'boolean')) {
             return true;
         }
     }
      // Presence of valid savedOptions array (as backup check)
      if (Array.isArray(card.savedOptions) && card.savedOptions.length > 0) {
           if (card.savedOptions.some(opt => opt && typeof opt.text === 'string' && typeof opt.isCorrect === 'boolean')) {
              return true;
          }
      }

     // Legacy type field (should be handled by migration, but check just in case)
     // if (card.type === 'multiple_choice') return true;

     return false; // Default to false
   }

   // Migrate legacy 'type' field used for question format to 'questionType'
   function migrateTypeToQuestionType(data) {
       if (!data) return data;
       // Handle arrays recursively
       if (Array.isArray(data)) {
           return data.map(item => migrateTypeToQuestionType(item));
       }
       // Handle objects
       if (typeof data === 'object' && data !== null) {
           const newData = { ...data }; // Clone to avoid modifying original
           // Check if legacy type field indicates question format
           if (newData.type === 'multiple_choice' || newData.type === 'short_answer') {
                // Only migrate if 'questionType' isn't already set or is different
               if (!newData.questionType || newData.questionType !== newData.type) {
                   console.log(`[Migration] Migrating legacy type ('${newData.type}') to questionType for item: ${newData.id || 'unknown'}`);
                   newData.questionType = newData.type;
               }
               // IMPORTANT: Reset the 'type' field to 'card' as the legacy value is now redundant for type classification
               newData.type = 'card';
           }
           // Ensure 'type' is set for items that might be missing it
           if (!newData.type) {
               // Basic inference: if it has question/answer it's likely a card, otherwise maybe topic?
               // This is less reliable, standardizeCards should handle final typing.
               if (newData.question || newData.answer) {
                   newData.type = 'card';
                    if(!newData.questionType) newData.questionType = 'short_answer'; // Default new cards
               } else if (newData.name && newData.subject) {
                    // Might be a topic shell - let standardizeCards confirm
               }
           }

           // Optional: Recursively process nested objects (usually not needed for card structure)
           // ...

           return newData;
       }
       // Return primitives or other types as is
       return data;
   }

    // Helper to split items into topics (shells) and cards based on 'type' or 'isShell'
    function splitByType(items) {
       if (!Array.isArray(items)) {
            console.warn("[Knack Script] splitByType called with non-array:", items);
           return { topics: [], cards: [] };
       }

        const topics = items.filter(item => item && (item.type === 'topic' || item.isShell === true));
        const cards = items.filter(item => {
           // Ensure item exists and is not explicitly a topic/shell
           return item && item.type !== 'topic' && item.isShell !== true;
           // We might also check if it looks like a card (e.g., has a question)
           // return item && (item.type === 'card' || (item.question && item.type !== 'topic'));
        });


       // Log counts for debugging
        // console.log(`[SplitByType] Input: ${items.length}, Output: ${topics.length} topics, ${cards.length} cards`);

       return { topics, cards };
    }


   // --- Topic Shell Creation Logic (Adapted from 5w) ---
   // Handles fetching existing data, generating/merging shells & metadata, and QUEUING the final save.
   async function createTopicShellsFromLists(topicLists, recordId, iframeWindow) {
       console.log(`[Knack Script] Initiating topic shell creation/update for record ${recordId}`);
       if (!Array.isArray(topicLists) || topicLists.length === 0 || !recordId) {
           console.warn("[Knack Script] Skipping shell creation: No topic lists or recordId provided.");
           // Optionally notify React app if needed
            if (iframeWindow) iframeWindow.postMessage({ type: 'TOPIC_SHELLS_PROCESSED', success: true, count: 0, message: "No lists provided." }, '*');
           return;
       }

       try {
           // 1. Fetch existing user data (includes cardBank, colorMapping, topicMetadata)
           console.log(`[Knack Script] Fetching existing data for shell creation (record ${recordId})`);
           const existingData = await saveQueue.getExistingData(recordId); // Use queue's fetcher

            // Ensure existingData is valid
            if (!existingData || !existingData.id) {
                 throw new Error(`Failed to fetch existing data for record ${recordId} during shell creation.`);
            }


           // 2. Parse existing data safely
           let subjectColors = {};
            let existingTopicMetadata = [];
            let existingItems = []; // From cardBankData

            try {
                let colorDataStr = existingData[FIELD_MAPPING.colorMapping];
                if (typeof colorDataStr === 'string' && colorDataStr.includes('%')) {
                   colorDataStr = safeDecodeURIComponent(colorDataStr);
                }
                subjectColors = safeParseJSON(colorDataStr, {}); // Default to empty object
            } catch (e) { console.error("Error parsing existing subject colors:", e); subjectColors = {}; }

           try {
               let metaDataStr = existingData[FIELD_MAPPING.topicMetadata];
               if (typeof metaDataStr === 'string' && metaDataStr.includes('%')) {
                   metaDataStr = safeDecodeURIComponent(metaDataStr);
               }
               existingTopicMetadata = safeParseJSON(metaDataStr, []); // Default to empty array
            } catch (e) { console.error("Error parsing existing topic metadata:", e); existingTopicMetadata = [];}

           try {
               let bankDataStr = existingData[FIELD_MAPPING.cardBankData];
               if (typeof bankDataStr === 'string' && bankDataStr.includes('%')) {
                   bankDataStr = safeDecodeURIComponent(bankDataStr);
               }
               existingItems = safeParseJSON(bankDataStr, []); // Default to empty array
            } catch(e) { console.error("Error parsing existing card bank data:", e); existingItems = [];}

           // Split existing items from card bank
           const { topics: existingTopicShells, cards: existingCards } = splitByType(existingItems);
           console.log(`[Knack Script] Existing data parsed: ${existingTopicShells.length} shells, ${existingCards.length} cards, ${existingTopicMetadata.length} metadata items.`);


           // 3. Generate New Topic Shells and update Colors/Metadata based on topicLists
           const { newShells, updatedColors, updatedMetadata } = generateNewShellsAndMetadata(
               topicLists,
               subjectColors, // Pass current colors
               existingTopicMetadata // Pass current metadata
           );
           console.log(`[Knack Script] Generated ${newShells.length} new shells based on topic lists.`);


           // 4. Merge new shells with existing shells (preserves card arrays in existing shells)
           const finalTopicShells = mergeTopicShells(existingTopicShells, newShells);
           console.log(`[Knack Script] Merged shells. Total shells: ${finalTopicShells.length}`);

           // 5. Combine final shells with existing cards for the new cardBankData payload
           const finalBankData = [...finalTopicShells, ...existingCards];

           // 6. Prepare the data payload for saving (includes updated bank, colors, metadata)
           // This payload object contains the specific fields we want to update
           const saveDataPayload = {
               // recordId is not part of the payload itself, passed to queue separately
               cards: finalBankData, // Updated card bank with merged shells
               colorMapping: updatedColors, // Potentially updated colors
               topicMetadata: updatedMetadata // Merged metadata
               // We will use preserveFields: true, so other fields like boxes, topicLists are kept
           };

           // 7. Queue the save operation using 'full' type as multiple fields are potentially updated
           console.log(`[Knack Script] Queuing 'full' save for topic shell creation/update for record ${recordId}.`);
           await saveQueue.addToQueue({
               type: 'full',
               data: saveDataPayload, // Pass the object containing the fields to update
               recordId: recordId,
               preserveFields: true // CRITICAL: preserve fields not explicitly in saveDataPayload (like boxes, topicLists field)
           });

           console.log(`[Knack Script] Successfully queued save after topic shell processing for record ${recordId}.`);

           // Notify React app immediately that shells were processed and save is queued
           if (iframeWindow) iframeWindow.postMessage({ type: 'TOPIC_SHELLS_PROCESSED', success: true, count: newShells.length }, '*');


       } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
           console.error("[Knack Script] Error during createTopicShellsFromLists:", errorMessage, error);
           // Notify React app of the failure
            if (iframeWindow) iframeWindow.postMessage({ type: 'TOPIC_SHELLS_PROCESSED', success: false, error: errorMessage }, '*');
       }
   }

    // Helper to generate new shells, colors, and metadata from topic lists
    function generateNewShellsAndMetadata(topicLists, currentSubjectColors, currentTopicMetadata) {
        const newShells = [];
        // Create copies to avoid modifying originals directly until the end
        const updatedMetadata = JSON.parse(JSON.stringify(currentTopicMetadata || []));
        const updatedColors = JSON.parse(JSON.stringify(currentSubjectColors || {}));

        const idMap = new Map(); // Track processed shell IDs in this run to avoid intra-list duplicates
        const uniqueSubjects = new Set(topicLists.map(list => list.subject || "General"));

        // --- Assign base colors if needed ---
        const baseColors = ['#3cb44b','#4363d8','#e6194B','#911eb4','#f58231','#42d4f4','#f032e6','#469990','#9A6324','#800000','#808000','#000075','#e6beff','#aaffc3','#ffd8b1','#808080', '#fabebe', '#008080', '#e6beff', '#aa6e28', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1', '#000075']; // Extended palette
        let colorIndexOffset = Object.keys(updatedColors).length; // Start assigning after existing colors
        uniqueSubjects.forEach((subject, index) => {
            if (!updatedColors[subject]) {
                updatedColors[subject] = baseColors[(colorIndexOffset + index) % baseColors.length];
            }
        });
         debugLog("[Shell Gen] Updated subject colors:", updatedColors);


        const now = new Date().toISOString();

        // --- Process Lists ---
        topicLists.forEach(list => {
            if (!list || !Array.isArray(list.topics)) {
                 console.warn("[Shell Gen] Skipping invalid topic list:", list);
                return;
            }

            const subject = sanitizeField(list.subject || "General");
            const examBoard = sanitizeField(list.examBoard || "General"); // Use General if empty
            const examType = sanitizeField(list.examType || "Course"); // Use Course if empty
            const subjectColor = updatedColors[subject]; // Get assigned color

            // Generate shades (implementation needed)
            const topicColors = generateShadeVariations(subjectColor, list.topics.length);

            list.topics.forEach((topic, index) => {
                // Basic validation for topic object
                if (!topic || (typeof topic !== 'object' && typeof topic !== 'string') || (!topic.id && !topic.name && !topic.topic && typeof topic !== 'string')) {
                     console.warn("[Shell Gen] Skipping invalid topic item:", topic);
                    return;
                }

                // Handle case where topic might just be a string name
                 const isStringTopic = typeof topic === 'string';
                 const topicName = sanitizeField(isStringTopic ? topic : (topic.name || topic.topic || "Unknown Topic"));
                 // Generate an ID if none provided, try to make it somewhat stable if possible
                 const topicId = isStringTopic
                     ? `topic_${subject}_${topicName.replace(/[^a-zA-Z0-9]/g, '_')}` // Generate ID from subject/name
                     : (topic.id || `topic_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);


                if (idMap.has(topicId)) {
                     console.log(`[Shell Gen] Skipping duplicate topic ID in this run: ${topicId}`);
                    return; // Skip duplicates within this generation run
                }

                 // Create the shell using standardizeCards for consistency
                  const shellData = {
                     id: topicId,
                     type: 'topic', // Explicitly set type
                     name: topicName, // Use sanitized name
                     topic: topicName, // Keep topic property too
                     subject: subject,
                     examBoard: examBoard,
                     examType: examType,
                     cardColor: topicColors[index % topicColors.length], // Assign topic color variation
                     subjectColor: subjectColor, // Assign base subject color
                     isShell: true,
                     createdAt: now, // Add creation timestamp
                     updatedAt: now
                 };

                 const standardizedShellArray = standardizeCards([shellData]); // Standardize the single shell
                 const shell = standardizedShellArray.length > 0 ? standardizedShellArray[0] : null;


                 if(shell) { // Ensure standardization didn't fail
                    newShells.push(shell);
                    idMap.set(topicId, true); // Mark ID as processed for this run

                    // --- Update Topic Metadata ---
                    const metadataIndex = updatedMetadata.findIndex(m => m.topicId === topicId);
                    const newMetadataEntry = {
                        topicId: topicId,
                        name: topicName, // Use sanitized name
                        subject: subject,
                        examBoard: examBoard,
                        examType: examType,
                        updated: now // Timestamp of this update/creation
                    };
                    if (metadataIndex >= 0) {
                        // Update existing metadata entry
                        updatedMetadata[metadataIndex] = { ...updatedMetadata[metadataIndex], ...newMetadataEntry };
                    } else {
                        // Add new metadata entry
                        updatedMetadata.push(newMetadataEntry);
                    }
                 } else {
                      console.warn(`[Shell Gen] Failed to standardize shell for topic:`, topic);
                 }
            });
        });
         debugLog("[Shell Gen] Generated Shells:", newShells);
          debugLog("[Shell Gen] Final Metadata:", updatedMetadata);

        return { newShells, updatedColors, updatedMetadata };
    }

     // Helper function to generate color variations
      function generateShadeVariations(baseColorHex, count) {
          if (!baseColorHex || typeof baseColorHex !== 'string' || !baseColorHex.startsWith('#')) {
              console.warn("Invalid baseColorHex for generateShadeVariations:", baseColorHex);
              return Array(count).fill('#cccccc'); // Default grey
          }
           if (count <= 0) return [];
           if (count === 1) return [baseColorHex]; // Return base if only one needed


          const shades = [];
          try {
              // Convert hex to HSL
              const hexToHSL = (hex) => {
                  hex = hex.replace('#', '');
                  const r = parseInt(hex.substring(0, 2), 16) / 255;
                  const g = parseInt(hex.substring(2, 4), 16) / 255;
                  const b = parseInt(hex.substring(4, 6), 16) / 255;
                  const max = Math.max(r, g, b), min = Math.min(r, g, b);
                  let h = 0, s = 0, l = (max + min) / 2;
                  if (max !== min) {
                      const d = max - min;
                      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                      switch (max) {
                          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                          case g: h = (b - r) / d + 2; break;
                          case b: h = (r - g) / d + 4; break;
                      }
                      h /= 6;
                  }
                  return { h, s, l };
              };

              // Convert HSL back to hex
              const hslToHex = (h, s, l) => {
                  let r, g, b;
                  if (s === 0) { r = g = b = l; }
                  else {
                      const hue2rgb = (p, q, t) => {
                          if (t < 0) t += 1; if (t > 1) t -= 1;
                          if (t < 1 / 6) return p + (q - p) * 6 * t;
                          if (t < 1 / 2) return q;
                          if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                          return p;
                      };
                      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                      const p = 2 * l - q;
                      r = hue2rgb(p, q, h + 1 / 3); g = hue2rgb(p, q, h); b = hue2rgb(p, q, h - 1 / 3);
                  }
                  const toHex = x => { const hex = Math.round(x * 255).toString(16); return hex.length === 1 ? '0' + hex : hex; };
                  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
              };

              const { h, s, l } = hexToHSL(baseColorHex);

              // Generate variations by adjusting lightness primarily
               // Aim for a range around the original lightness, e.g., l +/- 15%
               const minLightness = Math.max(0.2, l - 0.15); // Ensure minimum brightness
               const maxLightness = Math.min(0.85, l + 0.15); // Ensure maximum brightness
               const lightnessStep = count > 1 ? (maxLightness - minLightness) / (count - 1) : 0;


              for (let i = 0; i < count; i++) {
                  const currentL = count === 1 ? l : minLightness + (i * lightnessStep);
                  // Optional: slight hue variation too
                   // const currentH = (h + (i * 0.01)) % 1; // Very small hue shift
                   const currentH = h; // Keep hue constant for simpler shades
                  shades.push(hslToHex(currentH, s, currentL));
              }

          } catch (error) {
              console.error("Error generating shade variations:", error);
              // Fallback to repeating base color or default grey
              return Array(count).fill(baseColorHex || '#cccccc');
          }
          return shades;
      }


    // Merges existing topic shells with newly generated ones, preserving card arrays
    function mergeTopicShells(existingShells, newShells) {
        console.log(`[Merge Shells] Merging ${existingShells.length} existing with ${newShells.length} new shells.`);
        const finalShells = [];
        const existingMap = new Map();
         // Ensure existing shells are valid objects with IDs before adding to map
         existingShells.forEach(shell => {
             if (shell && typeof shell === 'object' && shell.id) {
                 existingMap.set(shell.id, shell);
             } else {
                  console.warn("[Merge Shells] Skipping invalid existing shell:", shell);
             }
         });

        const processedIds = new Set();

        // Process new shells: update existing or add if new
        newShells.forEach(newShell => {
            if (!newShell || !newShell.id) {
                 console.warn("[Merge Shells] Skipping invalid new shell:", newShell);
                return; // Skip invalid shells
            }

            const existing = existingMap.get(newShell.id);
            if (existing) {
                 // Merge: Keep existing cards array & created date, update the rest from newShell
                 // Use standardizeCards again on the merged result for final cleanup might be overkill but safe
                 const mergedShellData = {
                    ...newShell, // Take latest name, colors, metadata from new shell
                    cards: Array.isArray(existing.cards) ? existing.cards : [], // CRITICAL: Preserve existing cards array
                    isEmpty: !Array.isArray(existing.cards) || existing.cards.length === 0, // Recalculate isEmpty
                    created: existing.created || newShell.created, // Keep original creation date
                    updatedAt: new Date().toISOString() // Always update timestamp
                 };
                 // Standardize the merged shell
                 const stdMergedArray = standardizeCards([mergedShellData]);
                 if (stdMergedArray.length > 0) {
                    finalShells.push(stdMergedArray[0]);
                 } else {
                      console.warn(`[Merge Shells] Failed to standardize merged shell for ID: ${newShell.id}`);
                 }
            } else {
                // Add new shell (it should already be standardized)
                finalShells.push(newShell);
            }
            processedIds.add(newShell.id);
        });

        // Add back any existing shells that were *not* processed (i.e., not in the new list)
        existingMap.forEach((existingShell, id) => {
            if (!processedIds.has(id)) {
                 // Ensure the existing shell is standardized before adding back
                 const stdExistingArray = standardizeCards([existingShell]);
                 if (stdExistingArray.length > 0) {
                     finalShells.push(stdExistingArray[0]);
                      console.log(`[Merge Shells] Kept existing shell not present in new list: ${id}`);
                 } else {
                     console.warn(`[Merge Shells] Failed to standardize existing shell being kept: ${id}`);
                 }
            }
        });
         console.log(`[Merge Shells] Final shell count: ${finalShells.length}`);
        return finalShells;
    }


   // --- REMOVED Old/Redundant Functions ---
   // Functions like saveFlashcardUserData, handlePreserveFieldsDataSave, handleAddToBank,
   // addToBankDirectAPI, the old handleSaveData, actualSaveFunction, handleAddToBankPromise,
   // and _handleIframeMessageLogic have been replaced by the new SaveQueue and
   // message routing structure (handleMessageRouter -> specific handlers -> saveQueue).

 // --- Self-Executing Function Closure ---
}()); 
