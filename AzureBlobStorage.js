﻿
exports.newAzureBlobBlobStorage = function newAzureBlobBlobStorage(BOT, logger) {

    let FULL_LOG = true;
    let ERROR_LOG = true;
    let LOG_FILE_CONTENT = true;

    let bot = BOT;
    const ROOT_DIR = './';

    const MODULE_NAME = "Azure Blob Storage";
    const RETRY_WAIT_TIME = 10000;
    const MAX_RETRIES = 5;

    let AZURE_STORAGE = require('./AzureStorage')
    let storage = AZURE_STORAGE.newAzureStorage(bot, logger);

    let thisObject = {
        initialize: initialize,
        createFolder: createFolder,
        createTextFile: createTextFile,
        getTextFile: getTextFile
    };

    let readOnlyBlobService;
    let writeOnlyBlobService;
    let containerName;
    let environment = global.CURRENT_ENVIRONMENT;

    return thisObject;

    function initialize(pDataOwner, callBackFunction, disableLogging) {

        try {

            containerName = pDataOwner.toLowerCase();

            if (pDataOwner.environment !== undefined) { // This is use for data migration from one environment to the other.

                environment = pDataOwner.environment;

            }

            if (FULL_LOG === true && logger !== undefined) { logger.write(MODULE_NAME, "[INFO] initialize -> Entering function."); }
            if (FULL_LOG === true && logger !== undefined) { logger.write(MODULE_NAME, "[INFO] initialize -> environment = " + environment); }
            if (FULL_LOG === true && logger !== undefined) { logger.write(MODULE_NAME, "[INFO] initialize -> containerName = " + containerName); }



            let readConnectionString = global.USER_PROFILE.storagePermissions.get(pDataOwner + "." + "READ");

            if (readConnectionString !== undefined) {
                readOnlyBlobService = storage.createBlobService(readConnectionString);
            }

            let writeConnectionString = global.USER_PROFILE.storagePermissions.get(pDataOwner + "." + "WRITE");

            if (writeConnectionString !== undefined) {
                writeOnlyBlobService = storage.createBlobService(writeConnectionString);
            }

            if (readOnlyBlobService !== undefined || writeOnlyBlobService !== undefined) {

                callBackFunction(global.DEFAULT_OK_RESPONSE);
                return;

            } else {

                if (ERROR_LOG === true && logger !== undefined) { logger.write(MODULE_NAME, "[ERROR] initialize -> No READ or WRITE permissions found."); }
                if (ERROR_LOG === true && logger !== undefined) { logger.write(MODULE_NAME, "[ERROR] initialize -> pDataOwner = " + pDataOwner); }

                callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                return;

            }
        }
        catch (err) {

            if (ERROR_LOG === true && logger !== undefined) { logger.write(MODULE_NAME, "[ERROR] initialize -> err = " + err.message); }
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    function createFolder(pFolderPath, callBackFunction) {

        if (FULL_LOG === true && logger !== undefined) { logger.write(MODULE_NAME, "[INFO] createFolder -> Entering function."); }

        try {

            /* Folders do not need to be created when using blobs. */

            callBackFunction(global.DEFAULT_OK_RESPONSE);
            return;

        }
        catch (err) {
            if (ERROR_LOG === true && logger !== undefined) { logger.write(MODULE_NAME, "[ERROR] createFolder -> err = " + err.message); }
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    function createTextFile(pFolderPath, pFileName, pFileContent, callBackFunction) {

        let retryCount = 0;
        if (writeOnlyBlobService === undefined) {

            if (ERROR_LOG === true && logger !== undefined) { logger.write(MODULE_NAME, "[ERROR] createTextFile -> initialize function not executed or failed. Can not process this request. Sorry."); }
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
            return;
        }

        try {

            if (FULL_LOG === true && logger !== undefined) {
                logger.write(MODULE_NAME, "[INFO] createTextFile -> About to create a text file.");
                logger.write(MODULE_NAME, "[INFO] createTextFile -> containerName = " + containerName);
                logger.write(MODULE_NAME, "[INFO] createTextFile -> pFolderPath = " + pFolderPath);
                logger.write(MODULE_NAME, "[INFO] createTextFile -> pFileName = " + pFileName);
            }

            writeOnlyBlobService.createBlockBlobFromText(containerName, pFolderPath + "/" + pFileName, pFileContent, onFileCreated);

            function onFileCreated(err, result, response) {

                try {

                    if (FULL_LOG === true && logger !== undefined) {
                        logger.write(MODULE_NAME, "[INFO] createTextFile -> onFileCreated -> Response from Azure received.");
                        logger.write(MODULE_NAME, "[INFO] createTextFile -> onFileCreated -> err = " + JSON.stringify(err));
                    }

                    if (LOG_FILE_CONTENT === true && logger !== undefined) {
                        logger.write(MODULE_NAME, "[INFO] createTextFile -> onFileCreated -> result = " + JSON.stringify(result));
                        logger.write(MODULE_NAME, "[INFO] createTextFile -> onFileReceived -> response = " + JSON.stringify(response));
                        logger.write(MODULE_NAME, "[INFO] createTextFile -> onFileReceived -> pFileContent = " + pFileContent);
                    }

                    if (err) {

                        if (ERROR_LOG === true && logger !== undefined) { logger.write(MODULE_NAME, "[ERROR] createTextFile -> onFileCreated -> err = " + JSON.stringify(err)); }
                        if (ERROR_LOG === true && logger !== undefined) { logger.write(MODULE_NAME, "[ERROR] createTextFile -> onFileCreated -> result = " + JSON.stringify(result)); }
                        if (ERROR_LOG === true && logger !== undefined) { logger.write(MODULE_NAME, "[ERROR] createTextFile -> onFileCreated -> response = " + JSON.stringify(response)); }

                        if (ERROR_LOG === true && logger !== undefined) {
                            logger.write(MODULE_NAME, "[ERROR] createTextFile -> onFileReceived -> Error trying to create this file.");
                            logger.write(MODULE_NAME, "[ERROR] createTextFile -> onFileReceived -> containerName = " + containerName);
                            logger.write(MODULE_NAME, "[ERROR] createTextFile -> onFileReceived -> pFolderPath = " + pFolderPath);
                            logger.write(MODULE_NAME, "[ERROR] createTextFile -> onFileReceived -> pFileName = " + pFileName);
                            logger.write(MODULE_NAME, "[ERROR] createTextFile -> onFileReceived -> err.code = " + err.code);
                        }

                        if (
                            err.code === 'ECONNRESET' ||
                            err.code === 'ENOTFOUND' ||
                            err.code === 'ESOCKETTIMEDOUT' ||
                            err.code === 'ETIMEDOUT' ||
                            err.code === 'ECONNREFUSED' ||
                            err.code === 'EADDRINUSE' ||
                            err.code === 'EAI_AGAIN' ||
                            err.code === 'AuthenticationFailed' ||
                            err.code === 'OperationTimedOut' ||
                            err.code === 'ServerBusy'
                        ) {

                            setTimeout(retryCreateFile, RETRY_WAIT_TIME);
                            return;

                            function retryCreateFile() {
                                if(retryCount < MAX_RETRIES){
                                    logger.write(MODULE_NAME, "[INFO] createTextFile -> onFileCreated -> Retrying to create the file. Retry count: " + retryCount);

                                    writeOnlyBlobService.createBlockBlobFromText(containerName, pFolderPath + "/" + pFileName, pFileContent, onFileCreated);
                                }
                                return;
                            }
                        }

                        if (ERROR_LOG === true && logger !== undefined) { logger.write(MODULE_NAME, "[ERROR] createTextFile -> onFileCreated -> Dont know what to do here. Cancelling operation. "); }
                        callBackFunction(global.DEFAULT_FAIL_RESPONSE);

                    } else {
                        if (FULL_LOG === true && logger !== undefined) { logger.write(MODULE_NAME, "[INFO] createTextFile -> onFileCreated -> File Created."); }
                        callBackFunction(global.DEFAULT_OK_RESPONSE);
                    }
                }
                catch (err) {
                    if (ERROR_LOG === true && logger !== undefined) { logger.write(MODULE_NAME, "[ERROR] 'createTextFile' -> onFileCreated -> err = " + err.message); }
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }
        }
        catch (err) {
            if (ERROR_LOG === true && logger !== undefined) { logger.write(MODULE_NAME, "[ERROR] 'createTextFile' -> err = " + err.message); }
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
        }
    }

    function getTextFile(pFolderPath, pFileName, callBackFunction) {

        let retryCount = 0;
        if (readOnlyBlobService === undefined) {

            if (ERROR_LOG === true && logger !== undefined) { logger.write(MODULE_NAME, "[ERROR] getTextFile -> initialize function not executed or failed. Can not process this request. Sorry."); }
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
            return;
        }

        try {

            if (FULL_LOG === true && logger !== undefined) {
                logger.write(MODULE_NAME, "[INFO] getTextFile -> About to get a text file.");
                logger.write(MODULE_NAME, "[INFO] getTextFile -> containerName = " + containerName);
                logger.write(MODULE_NAME, "[INFO] getTextFile -> pFolderPath = " + pFolderPath);
                logger.write(MODULE_NAME, "[INFO] getTextFile -> pFileName = " + pFileName);
            }

            readOnlyBlobService.getBlobToText(containerName, pFolderPath + "/" + pFileName, onFileReceived);

            function onFileReceived(err, text, response) {

                try {

                    if (FULL_LOG === true && logger !== undefined) {
                        logger.write(MODULE_NAME, "[INFO] getTextFile -> onFileReceived -> Response from Azure received.");
                        logger.write(MODULE_NAME, "[INFO] getTextFile -> onFileReceived -> err = " + JSON.stringify(err));
                    }

                    if (LOG_FILE_CONTENT === true && logger !== undefined) {
                        logger.write(MODULE_NAME, "[INFO] getTextFile -> onFileReceived -> response = " + JSON.stringify(response));
                        logger.write(MODULE_NAME, "[INFO] getTextFile -> onFileReceived -> text = " + text);
                    }

                    if (err) {

                        if (ERROR_LOG === true && logger !== undefined && err.code !== 'BlobNotFound') {
                            logger.write(MODULE_NAME, "[ERROR] getTextFile -> onFileReceived -> Error trying to get this file.");
                            logger.write(MODULE_NAME, "[ERROR] getTextFile -> onFileReceived -> containerName = " + containerName);
                            logger.write(MODULE_NAME, "[ERROR] getTextFile -> onFileReceived -> pFolderPath = " + pFolderPath);
                            logger.write(MODULE_NAME, "[ERROR] getTextFile -> onFileReceived -> pFileName = " + pFileName);
                            logger.write(MODULE_NAME, "[ERROR] getTextFile -> onFileReceived -> err.code = " + err.code);
                        }

                        if (
                            err.code === 'ECONNRESET' ||
                            err.code === 'ENOTFOUND' ||
                            err.code === 'ESOCKETTIMEDOUT' ||
                            err.code === 'ETIMEDOUT' ||
                            err.code === 'ECONNREFUSED' ||
                            err.code === 'EADDRINUSE' ||
                            err.code === 'EAI_AGAIN' ||
                            err.code === 'AuthenticationFailed' ||
                            err.code === 'OperationTimedOut' ||
                            err.code === 'ServerBusy'
                        ) {

                            setTimeout(retryCreateFile, RETRY_WAIT_TIME);
                            return;

                            function retryCreateFile() {
                                if(retryCount < MAX_RETRIES){
                                    logger.write(MODULE_NAME, "[INFO] getTextFile -> onFileReceived -> Retrying to get the file. Retry count: " + retryCount);
                                    readOnlyBlobService.getBlobToText(containerName, pFolderPath + "/" + pFileName, onFileReceived);
                                }
                                return;
                            }
                        }

                        if (err.code === "BlobNotFound") {

                            /* This is how Azure tell us the file does not exist. */

                            let customErr = {
                                result: global.CUSTOM_FAIL_RESPONSE.result,
                                message: "File does not exist."
                            };

                            logger.write(MODULE_NAME, "[WARN] getTextFile -> onFileReceived -> Custom Response -> message = " + customErr.message);
                            logger.write(MODULE_NAME, "[WARN] getTextFile -> containerName = " + containerName);
                            logger.write(MODULE_NAME, "[WARN] getTextFile -> pFolderPath = " + pFolderPath);
                            logger.write(MODULE_NAME, "[WARN] getTextFile -> pFileName = " + pFileName);

                            callBackFunction(customErr);
                            return;

                        }

                        if (err.code === "ParentNotFound") {

                            /* This is how Azure tell us the folder where the file was supposed to be does not exist. We map this to our own response. */

                            let customErr = {
                                result: global.CUSTOM_FAIL_RESPONSE.result,
                                message: "Folder does not exist."
                            };

                            logger.write(MODULE_NAME, "[WARN] getTextFile -> onFileReceived -> Custom Response -> message = " + customErr.message);
                            logger.write(MODULE_NAME, "[WARN] getTextFile -> containerName = " + containerName);
                            logger.write(MODULE_NAME, "[WARN] getTextFile -> pFolderPath = " + pFolderPath);
                            logger.write(MODULE_NAME, "[WARN] getTextFile -> pFileName = " + pFileName);

                            callBackFunction(customErr);
                            return;

                        }

                        if (ERROR_LOG === true && logger !== undefined) { logger.write(MODULE_NAME, "[ERROR] getTextFile -> onFileCreated -> err = " + JSON.stringify(err)); }
                        if (ERROR_LOG === true && logger !== undefined) { logger.write(MODULE_NAME, "[ERROR] getTextFile -> onFileCreated -> response = " + JSON.stringify(response)); }

                        if (ERROR_LOG === true && logger !== undefined) { logger.write(MODULE_NAME, "[ERROR] getTextFile -> onFileReceived -> Dont know what to do here. Cancelling operation. "); }
                        callBackFunction(global.DEFAULT_FAIL_RESPONSE);

                    } else {
                        if (FULL_LOG === true && logger !== undefined) { logger.write(MODULE_NAME, "[INFO] getTextFile -> onFileReceived -> File retrieved."); }
                        callBackFunction(global.DEFAULT_OK_RESPONSE, text);
                    }
                }
                catch (err) {
                    if (ERROR_LOG === true && logger !== undefined) { logger.write(MODULE_NAME, "[ERROR] 'getTextFile' -> onFileReceived -> err = " + err.message); }
                    callBackFunction(global.DEFAULT_FAIL_RESPONSE);
                }
            }
        }
        catch (err) {
            if (ERROR_LOG === true && logger !== undefined) { logger.write(MODULE_NAME, "[ERROR] 'getTextFile' -> err = " + err.message); }
            callBackFunction(global.DEFAULT_FAIL_RESPONSE);
        }
    }

};
