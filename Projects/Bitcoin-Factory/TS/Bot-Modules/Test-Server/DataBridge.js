exports.newDataBridge = function newDataBridge(processIndex) {
    /*
    This modules bring the data from Superalgos Indicators into a time-series file for each Test Case, 
    that can later be fed to a Machine Learning Model.
    */
    let thisObject = {
        updateDatasetFiles: updateDatasetFiles,
        getFiles: getFiles,
        initialize: initialize,
        finalize: finalize
    }

    let savedDatasets
    let timeSeriesFileFeatures = TS.projects.foundations.globals.taskConstants.TASK_NODE.bot.config.timeSeriesFile.features
    let timeSeriesFileLabels = TS.projects.foundations.globals.taskConstants.TASK_NODE.bot.config.timeSeriesFile.labels

    return thisObject

    function initialize() {
        savedDatasets = new Map()

        /*
        Create Missing Folders, if needed.
        */
        let dir
        dir = global.env.PATH_TO_BITCOIN_FACTORY + '/Test-Server/StateData/TestCases'
        if (!SA.nodeModules.fs.existsSync(dir)) {
            SA.nodeModules.fs.mkdirSync(dir, { recursive: true });
        }

        dir = global.env.PATH_TO_BITCOIN_FACTORY + '/Test-Server/StateData/ForecastCases'
        if (!SA.nodeModules.fs.existsSync(dir)) {
            SA.nodeModules.fs.mkdirSync(dir, { recursive: true });
        }

        dir = global.env.PATH_TO_BITCOIN_FACTORY + '/Test-Server/OutputData/TestData'
        if (!SA.nodeModules.fs.existsSync(dir)) {
            SA.nodeModules.fs.mkdirSync(dir, { recursive: true });
        }

        dir = global.env.PATH_TO_BITCOIN_FACTORY + '/Test-Server/OutputData/TestReports'
        if (!SA.nodeModules.fs.existsSync(dir)) {
            SA.nodeModules.fs.mkdirSync(dir, { recursive: true });
        }
    }

    function finalize() {

    }

    async function updateDatasetFiles(testCase) {
        let forcastedCandle
        let mainTimeFrame = testCase.parameters.LIST_OF_TIMEFRAMES[0]
        let mainAsset = testCase.parameters.LIST_OF_ASSETS[0]
        let assetsToInclude = testCase.parameters.LIST_OF_ASSETS
        let timeFramesToInclude = testCase.parameters.LIST_OF_TIMEFRAMES
        let testCaseId = TS.projects.foundations.globals.taskConstants.TEST_SERVER.utilities.pad(testCase.id, 10)

        createParametersFile()
        await createTimeSeriesFile()

        return forcastedCandle

        function createParametersFile() {
            /*
            We will prevent creating a parameters file more than once.
            */
            if (testCase.filesTimestaps !== undefined && testCase.filesTimestaps.parameters !== undefined) {
                return
            }
            /*
            Prepering the Parameters File
            */
            let parametersFile = ""

            parametersFile = parametersFile +
                /* Headers */
                "PARAMETER" + "   " + "VALUE" + "\r\n"
            /* Values */
            let parameters = Object.keys(testCase.parameters)
            for (let i = 0; i < parameters.length; i++) {
                let parameter = parameters[i]
                parametersFile = parametersFile + parameter + "   " + testCase.parameters[parameter] + "\r\n"
            }

            SA.nodeModules.fs.writeFileSync(global.env.PATH_TO_BITCOIN_FACTORY + "/Test-Server/OutputData/TestData/parameters-" + testCaseId + ".CSV", parametersFile)

            if (testCase.filesTimestaps === undefined) {
                testCase.filesTimestaps = {}
            }
            testCase.filesTimestaps.parameters = (new Date()).toISOString()
        }

        async function createTimeSeriesFile() {
            /*
            Only create files with the same data once...
            */
            let currentFileHash
            let savedDataset = savedDatasets.get(testCase.timeSeriesFileName)
            if (savedDataset !== undefined) {
                forcastedCandle = savedDataset.forcastedCandle
                let timestamp = (new Date()).valueOf()
                /*
                If the file is not expired, then there is no need to run the process that
                generates it, since it will produce the same file.
                */
                if (timestamp < savedDataset.expiration) {
                    return forcastedCandle
                } else {
                    currentFileHash = savedDataset.fileHash
                }
            }
            /*
            Preparing the Time-Series File
            */
            let timeSeriesFile = ""
            let objectsMap = new Map()
            let indicatorsMap = new Map()
            let firstTimestamp
            let lastTimestamp
            let maxTimeFrameValue = 0

            await addTimeFramesAndAssets()
            createFileContent()
            saveTimeSeriesFile()

            async function addTimeFramesAndAssets() {
                for (let i = 0; i < TS.projects.foundations.globals.taskConstants.TEST_SERVER.utilities.marketTimeFramesArray.length; i++) {
                    let timeFrameValue = TS.projects.foundations.globals.taskConstants.TEST_SERVER.utilities.marketTimeFramesArray[i][0]
                    let timeFrameLabel = TS.projects.foundations.globals.taskConstants.TEST_SERVER.utilities.marketTimeFramesArray[i][1]

                    if (timeFramesToInclude.includes(timeFrameLabel)) {
                        for (let j = 0; j < assetsToInclude.length; j++) {
                            let asset = assetsToInclude[j]
                            await addMarketFile(asset, timeFrameValue, timeFrameLabel)
                        }
                    }
                }

                async function addMarketFile(asset, timeFrameValue, timeFrameLabel) {
                    /*
                    We will put all the object we find in files at objectsMap to be later retrieved from there.
                    */
                    if (timeFrameValue > maxTimeFrameValue) (maxTimeFrameValue = timeFrameValue)

                    /*
                    Add Labels  
                    */
                    for (let q = 0; q < timeSeriesFileLabels.length; q++) {
                        let label = timeSeriesFileLabels[q]
                        addToObjectMap(label)
                    }
                    /*
                    Add Features 
                    */
                    for (let q = 0; q < timeSeriesFileFeatures.length; q++) {
                        let feature = timeSeriesFileFeatures[q]
                        addToObjectMap(feature)
                    }

                    async function addToObjectMap(featuresOrLabelsObject) {

                        let indicatorKey = featuresOrLabelsObject.dataMine + '-' + featuresOrLabelsObject.indicator + '-' + featuresOrLabelsObject.product
                        let indicatorAlreadyProcessed = indicatorsMap.get(indicatorKey)
                        if (indicatorAlreadyProcessed !== undefined) { return }

                        let candlesFileContent = await TS.projects.foundations.globals.taskConstants.TEST_SERVER.utilities.getIndicatorFile(
                            featuresOrLabelsObject.dataMine,
                            featuresOrLabelsObject.indicator,
                            featuresOrLabelsObject.product,
                            'binance',
                            asset,
                            'USDT',
                            'Multi-Time-Frame-Market',
                            timeFrameLabel
                        )

                        let indicatorFile = JSON.parse(candlesFileContent)

                        if (featuresOrLabelsObject.product === "Candles") {
                            /*
                            First Candle and last Candle defines the First Timestamp and Last Timestamp
                            */
                            firstTimestamp = indicatorFile[0][4]
                            lastTimestamp = indicatorFile[indicatorFile.length - 1][4]
                        }

                        for (let i = 0; i < indicatorFile.length - 1; i++) {
                            let objectArray = indicatorFile[i]
                            let object = {
                                min: objectArray[0],
                                max: objectArray[1],
                                open: objectArray[2],
                                close: objectArray[3],
                                begin: objectArray[4],
                                end: objectArray[5]
                            }

                            let key = asset + "-" + featuresOrLabelsObject.objectName + "-" + timeFrameLabel + "-" + object.begin
                            objectsMap.set(key, object)

                            if (featuresOrLabelsObject.product === "Candles") {
                                if (i === indicatorFile.length - 2 && mainTimeFrame === timeFrameLabel && mainAsset === asset) {
                                    forcastedCandle = {
                                        begin: candle.begin,
                                        end: candle.end,
                                        open: candle.close
                                    }
                                }
                            }
                        }

                        indicatorsMap.set(indicatorKey, true)
                    }
                }
            }

            function createFileContent() {
                let timestamp = firstTimestamp
                let headerAdded = false
                /*
                Loop thorugh all the possible time slots, based on the main dependency that are candles.
                */
                while (timestamp <= lastTimestamp) {
                    let maxSubRecords = 0
                    let subRecords = []
                    let header = "Timestamp"

                    for (let i = 0; i < TS.projects.foundations.globals.taskConstants.TEST_SERVER.utilities.marketTimeFramesArray.length; i++) {
                        let timeFrameValue = TS.projects.foundations.globals.taskConstants.TEST_SERVER.utilities.marketTimeFramesArray[i][0]
                        let timeFrameLabel = TS.projects.foundations.globals.taskConstants.TEST_SERVER.utilities.marketTimeFramesArray[i][1]

                        if (timeFramesToInclude.includes(timeFrameLabel)) {

                            for (let j = 0; j < assetsToInclude.length; j++) {
                                let asset = assetsToInclude[j]
                                addToFile(asset, timeFrameValue, timeFrameLabel, timeSeriesFileLabels)
                            }
                            for (let j = 0; j < assetsToInclude.length; j++) {
                                let asset = assetsToInclude[j]
                                addToFile(asset, timeFrameValue, timeFrameLabel, timeSeriesFileFeatures)
                            }
                        }
                    }

                    if (subRecords.length === maxSubRecords) {
                        /*
                        Only once we add the File Header
                        */
                        if (headerAdded === false) {
                            timeSeriesFile = timeSeriesFile +
                                header +
                                "\r\n"
                            headerAdded = true
                        }
                        /*
                        Everytime we add a File Record
                        */
                        timeSeriesFile = timeSeriesFile +
                            timestamp
                        for (let i = 0; i < subRecords.length; i++) {
                            let subRecord = subRecords[i]
                            timeSeriesFile = timeSeriesFile +
                                subRecord
                        }
                        timeSeriesFile = timeSeriesFile +
                            "\r\n"
                    }

                    timestamp = timestamp + maxTimeFrameValue

                    function addToFile(asset, timeFrameValue, timeFrameLabel, featuresOrLabelsObjects) {
                        /*
                        This is the procedure that adds only all objects.
                        */
                        let keyTimestamp
                        let maxObjectsToAdd = maxTimeFrameValue / timeFrameValue
                        maxSubRecords = maxSubRecords + maxObjectsToAdd

                        for (let i = 0; i < maxObjectsToAdd; i++) {
                            keyTimestamp = timestamp + i * timeFrameValue

                            iterateOverFeaturesOrLabels()

                            function iterateOverFeaturesOrLabels() {

                                let subRecord = ""

                                for (let j = 0; j < featuresOrLabelsObjects.length; j++) {
                                    let propertyName = featuresOrLabelsObjects[j].propertyName
                                    let objectName = featuresOrLabelsObjects[j].objectName

                                    let objectKey = asset + "-" + propertyName + "-" + timeFrameLabel + "-" + keyTimestamp
                                    let object = objectsMap.get(objectKey)

                                    if (object === undefined) {
                                        object = {
                                            min: 0,
                                            max: 0,
                                            open: 0,
                                            close: 0,
                                            begin: 0,
                                            end: 0
                                        }
                                    }
                                    if (objectName === 'candle' && (object.max === 0 || object.min === 0 || object.open === 0)) {
                                        /* We will discard records where these candle properties are zero */
                                        return
                                    }

                                    subRecord = subRecord +
                                        "   " + object[propertyName]

                                    header = header +
                                        "   " + asset + "-" + objectName + "." + propertyName + + "-" + timeFrameLabel + "-" + (i + 1)
                                }

                                if (subRecord !== "") {
                                    subRecords.push(subRecord)
                                }
                            }
                        }
                    }
                }
            }

            function saveTimeSeriesFile() {
                /*
                    We will save the file only if it is different from the previous one, and if we do,
                    we will remember the file saved, it's hash and we'll get for it a new expiration time.
                */
                let newFileHash = TS.projects.foundations.globals.taskConstants.TEST_SERVER.utilities.hash(timeSeriesFile)
                if (currentFileHash === undefined || currentFileHash !== newFileHash) {

                    SA.nodeModules.fs.writeFileSync(global.env.PATH_TO_BITCOIN_FACTORY + "/Test-Server/OutputData/TestData/" + testCase.timeSeriesFileName + ".CSV", timeSeriesFile)
                    console.log((new Date()).toISOString(), 'Dataset File Saved: ' + testCase.timeSeriesFileName)

                    savedDataset = {
                        fileHash: newFileHash,
                        forcastedCandle: forcastedCandle,
                        expiration: TS.projects.foundations.globals.taskConstants.TEST_SERVER.utilities.getExpiration(testCase)
                    }
                    savedDatasets.set(testCase.timeSeriesFileName, savedDataset)
                }
            }
        }
    }

    function getFiles(testCase) {
        let testCaseId = TS.projects.foundations.globals.taskConstants.TEST_SERVER.utilities.pad(testCase.id, 5)
        let files = {}
        files.parameters = SA.nodeModules.fs.readFileSync(global.env.PATH_TO_BITCOIN_FACTORY + "/Test-Server/OutputData/TestData/parameters-" + testCaseId + ".CSV")
        files.timeSeries = SA.nodeModules.fs.readFileSync(global.env.PATH_TO_BITCOIN_FACTORY + "/Test-Server/OutputData/TestData/" + testCase.timeSeriesFileName + ".CSV")
        return files
    }
}
