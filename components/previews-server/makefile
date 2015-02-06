MOCHA=NODE_ENV=development TEST=true ../../node_modules/.bin/mocha
APP_CONFIG=--http.noSSL true --http.port 3001 --logs.console.timestamp false
ifdef TEST
	TEST_FILES=test/$(TEST).test.js
else
	TEST_FILES=test/*.test.js
endif
ANALYSIS_SOURCE_OUTPUT=analysis-source
ANALYSIS_TEST_OUTPUT=analysis-test

test:
	@$(MOCHA) --timeout 10000 --reporter dot $(APP_CONFIG) --logs.console.active false $(TEST_FILES)

test-detailed:
	@$(MOCHA) --timeout 10000 --reporter spec $(APP_CONFIG) $(TEST_FILES)

test-debug:
	@$(MOCHA) --timeout 3600000 --reporter spec --debug-brk $(APP_CONFIG) $(TEST_FILES)

test-profile:
	@$(MOCHA) --timeout 10000 --reporter dot --profile=true $(APP_CONFIG) --logs.console.active false $(TEST_FILES)
	@hash tick-processor 2>&- || { echo >&2 "Reading profiling results (v8.log) requires tick-processor (or equivalent). To install: npm install -g tick-processor"; exit 1; }
	@tick-processor > profiling-output.txt
	@open profiling-output.txt

test-coverage:
	@$(MOCHA) --timeout 10000 --reporter html-cov --require blanket $(APP_CONFIG) $(TEST_FILES) > coverage.html
	@open coverage.html

analysis:
	@hash plato 2>&- || { echo >&2 "Analysis requires plato. To install: npm install -g plato"; exit 1; }
	@plato -t "browser-server source analysis" -l .jshintrc -r -d $(ANALYSIS_SOURCE_OUTPUT) source
	@plato -t "browser-server test analysis" -l .jshintrc -r -d $(ANALYSIS_TEST_OUTPUT) test
	@open $(ANALYSIS_SOURCE_OUTPUT)/index.html
	@open $(ANALYSIS_TEST_OUTPUT)/index.html

.PHONY: test
