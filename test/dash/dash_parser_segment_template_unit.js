/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

describe('DashParser SegmentTemplate', function() {
  /** @const */
  var Dash = shaka.test.Dash;
  /** @const */
  var ManifestParser = shaka.test.ManifestParser;
  /** @const */
  var baseUri = 'http://example.com/';

  /** @type {!shaka.test.FakeNetworkingEngine} */
  var fakeNetEngine;
  /** @type {!shaka.dash.DashParser} */
  var parser;
  /** @type {shakaExtern.ManifestParser.PlayerInterface} */
  var playerInterface;

  beforeEach(function() {
    fakeNetEngine = new shaka.test.FakeNetworkingEngine();
    parser = shaka.test.Dash.makeDashParser();

    playerInterface = {
      networkingEngine: fakeNetEngine,
      filterNewPeriod: function() {},
      filterAllPeriods: function() {},
      onTimelineRegionAdded: fail,  // Should not have any EventStream elements.
      onEvent: fail,
      onError: fail
    };
  });

  shaka.test.Dash.makeTimelineTests(
      'SegmentTemplate', 'media="s$Number$.mp4"', []);

  describe('duration', function() {
    it('basic support', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="1" media="s$Number$.mp4"',
        '  duration="10" />'
      ], 60 /* duration */);
      var references = [
        ManifestParser.makeReference('s1.mp4', 0, 0, 10, baseUri),
        ManifestParser.makeReference('s2.mp4', 1, 10, 20, baseUri),
        ManifestParser.makeReference('s3.mp4', 2, 20, 30, baseUri),
        ManifestParser.makeReference('s4.mp4', 3, 30, 40, baseUri),
        ManifestParser.makeReference('s5.mp4', 4, 40, 50, baseUri),
        ManifestParser.makeReference('s6.mp4', 5, 50, 60, baseUri)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('with @startNumber > 1', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="10" media="s$Number$.mp4"',
        '   duration="10" />'
      ], 30 /* duration */);
      var references = [
        ManifestParser.makeReference('s10.mp4', 0, 0, 10, baseUri),
        ManifestParser.makeReference('s11.mp4', 1, 10, 20, baseUri),
        ManifestParser.makeReference('s12.mp4', 2, 20, 30, baseUri)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('honors presentationTimeOffset', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate media="s$Number$.mp4" duration="10"',
        ' presentationTimeOffset="50" />'
      ], 30 /* duration */);

      // Due to PTO, the first segment is number 6 and position 5.
      var references = [
        ManifestParser.makeReference('s6.mp4', 5, 0, 10, baseUri),
        ManifestParser.makeReference('s7.mp4', 6, 10, 20, baseUri),
        ManifestParser.makeReference('s8.mp4', 7, 20, 30, baseUri)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('handles segments larger than the period', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate media="s$Number$.mp4" duration="60" />'
      ], 30 /* duration */);
      // The first segment is number 1 and position 0.
      // Although the segment is 60 seconds long, it is clipped to the period
      // duration of 30 seconds.
      var references = [
        ManifestParser.makeReference('s1.mp4', 0, 0, 30, baseUri)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('allows negative start times', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate media="s$Number$.mp4" duration="60"',
        ' presentationTimeOffset="50" />'
      ], 70 /* duration */);

      // Due to PTO, the first segment has a negative start time.  It is
      // included because it is partially within the period.
      var references = [
        ManifestParser.makeReference('s1.mp4', 0, -50, 10, baseUri),
        ManifestParser.makeReference('s2.mp4', 1, 10, 70, baseUri)
      ];
      Dash.testSegmentIndex(done, source, references);
    });
  });

  describe('index', function() {
    it('basic support', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="1" index="index-$Bandwidth$.mp4"',
        '    initialization="init-$Bandwidth$.mp4" />'
      ]);

      fakeNetEngine.setResponseMapAsText({
        'dummy://foo': source,
        'http://example.com/index-500.mp4': ''
      });
      parser.start('dummy://foo', playerInterface)
          .then(function(manifest) {
            expect(manifest).toEqual(
                Dash.makeManifestFromInit('init-500.mp4', 0, null));
            return Dash.callCreateSegmentIndex(manifest);
          })
          .then(function() {
            expect(fakeNetEngine.request.calls.count()).toBe(2);
            fakeNetEngine.expectRangeRequest(
                'http://example.com/index-500.mp4', 0, null);
          })
          .catch(fail)
          .then(done);
    });

    it('defaults to index with multiple segment sources', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="1" index="index-$Bandwidth$.mp4"',
        '    initialization="init-$Bandwidth$.mp4">',
        '  <SegmentTimeline>',
        '    <S t="0" d="3" r="12" />',
        '  </SegmentTimeline>',
        '</SegmentTemplate>'
      ]);

      fakeNetEngine.setResponseMapAsText({
        'dummy://foo': source,
        'http://example.com/index-500.mp4': ''
      });
      parser.start('dummy://foo', playerInterface)
          .then(function(manifest) {
            expect(manifest).toEqual(
                Dash.makeManifestFromInit('init-500.mp4', 0, null));
            return Dash.callCreateSegmentIndex(manifest);
          })
          .then(function() {
            expect(fakeNetEngine.request.calls.count()).toBe(2);
            fakeNetEngine.expectRangeRequest(
                'http://example.com/index-500.mp4', 0, null);
          })
          .catch(fail)
          .then(done);
    });

    it('requests init data for WebM', function(done) {
      var source = [
        '<MPD mediaPresentationDuration="PT75S">',
        '  <Period>',
        '    <BaseURL>http://example.com</BaseURL>',
        '    <AdaptationSet mimeType="video/webm">',
        '      <Representation bandwidth="500">',
        '        <SegmentTemplate startNumber="1"',
        '            index="index-$Bandwidth$.webm"',
        '            initialization="init-$Bandwidth$.webm" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>'
      ].join('\n');

      fakeNetEngine.setResponseMapAsText({
        'dummy://foo': source,
        'http://example.com/index-500.webm': '',
        'http://example.com/init-500.webm': ''
      });
      parser.start('dummy://foo', playerInterface)
          .then(function(manifest) {
            expect(manifest).toEqual(
                Dash.makeManifestFromInit('init-500.webm', 0, null));
            return Dash.callCreateSegmentIndex(manifest);
          })
          .then(function() {
            expect(fakeNetEngine.request.calls.count()).toBe(3);
            fakeNetEngine.expectRangeRequest(
                'http://example.com/init-500.webm', 0, null);
            fakeNetEngine.expectRangeRequest(
                'http://example.com/index-500.webm', 0, null);
          })
          .catch(fail)
          .then(done);
    });

    it('inherits from Period', function(done) {
      var source = [
        '<MPD mediaPresentationDuration="PT75S">',
        '  <Period>',
        '    <BaseURL>http://example.com</BaseURL>',
        '    <SegmentTemplate startNumber="1" index="index-$Bandwidth$.mp4"',
        '        initialization="init-$Bandwidth$.mp4" />',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <Representation bandwidth="500" />',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>'
      ].join('\n');

      fakeNetEngine.setResponseMapAsText({
        'dummy://foo': source,
        'http://example.com/index-500.mp4': ''
      });
      parser.start('dummy://foo', playerInterface)
          .then(function(manifest) {
            expect(manifest).toEqual(
                Dash.makeManifestFromInit('init-500.mp4', 0, null));
            return Dash.callCreateSegmentIndex(manifest);
          })
          .then(function() {
            expect(fakeNetEngine.request.calls.count()).toBe(2);
            fakeNetEngine.expectRangeRequest(
                'http://example.com/index-500.mp4', 0, null);
          })
          .catch(fail)
          .then(done);
    });

    it('inherits from AdaptationSet', function(done) {
      var source = [
        '<MPD mediaPresentationDuration="PT75S">',
        '  <Period>',
        '    <AdaptationSet mimeType="video/mp4">',
        '      <BaseURL>http://example.com</BaseURL>',
        '      <SegmentTemplate startNumber="1" index="index-$Bandwidth$.mp4"',
        '          initialization="init-$Bandwidth$.mp4" />',
        '      <Representation bandwidth="500" />',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>'
      ].join('\n');

      fakeNetEngine.setResponseMapAsText({
        'dummy://foo': source,
        'http://example.com/index-500.mp4': ''
      });
      parser.start('dummy://foo', playerInterface)
          .then(function(manifest) {
            expect(manifest).toEqual(
                Dash.makeManifestFromInit('init-500.mp4', 0, null));
            return Dash.callCreateSegmentIndex(manifest);
          })
          .then(function() {
            expect(fakeNetEngine.request.calls.count()).toBe(2);
            fakeNetEngine.expectRangeRequest(
                'http://example.com/index-500.mp4', 0, null);
          })
          .catch(fail)
          .then(done);
    });
  });

  describe('media template', function() {
    it('defaults to timeline when also has duration', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="0" duration="10"',
        '    media="$Number$-$Time$-$Bandwidth$.mp4">',
        '  <SegmentTimeline>',
        '    <S t="0" d="15" r="2" />',
        '  </SegmentTimeline>',
        '</SegmentTemplate>'
      ], 45 /* duration */);
      var references = [
        ManifestParser.makeReference('0-0-500.mp4', 0, 0, 15, baseUri),
        ManifestParser.makeReference('1-15-500.mp4', 1, 15, 30, baseUri),
        ManifestParser.makeReference('2-30-500.mp4', 2, 30, 45, baseUri)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('with @startnumber = 0', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="0" duration="10"',
        '    media="$Number$-$Time$-$Bandwidth$.mp4" />'
      ], 30 /* duration */);
      var references = [
        ManifestParser.makeReference('0-0-500.mp4', 0, 0, 10, baseUri),
        ManifestParser.makeReference('1-10-500.mp4', 1, 10, 20, baseUri),
        ManifestParser.makeReference('2-20-500.mp4', 2, 20, 30, baseUri)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('with @startNumber = 1', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="1" duration="10"',
        '    media="$Number$-$Time$-$Bandwidth$.mp4" />'
      ], 30 /* duration */);
      var references = [
        ManifestParser.makeReference('1-0-500.mp4', 0, 0, 10, baseUri),
        ManifestParser.makeReference('2-10-500.mp4', 1, 10, 20, baseUri),
        ManifestParser.makeReference('3-20-500.mp4', 2, 20, 30, baseUri)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('with @startNumber > 1', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="10" duration="10"',
        '    media="$Number$-$Time$-$Bandwidth$.mp4" />'
      ], 30 /* duration */);
      var references = [
        ManifestParser.makeReference('10-0-500.mp4', 0, 0, 10, baseUri),
        ManifestParser.makeReference('11-10-500.mp4', 1, 10, 20, baseUri),
        ManifestParser.makeReference('12-20-500.mp4', 2, 20, 30, baseUri)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('with @timescale > 1', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="1" timescale="9000" duration="9000"',
        '    media="$Number$-$Time$-$Bandwidth$.mp4" />'
      ], 3 /* duration */);
      var references = [
        ManifestParser.makeReference('1-0-500.mp4', 0, 0, 1, baseUri),
        ManifestParser.makeReference('2-9000-500.mp4', 1, 1, 2, baseUri),
        ManifestParser.makeReference('3-18000-500.mp4', 2, 2, 3, baseUri)
      ];
      Dash.testSegmentIndex(done, source, references);
    });

    it('across representations', function(done) {
      var source = [
        '<MPD>',
        '  <Period duration="PT60S">',
        '    <AdaptationSet mimeType="video/webm">',
        '      <BaseURL>http://example.com</BaseURL>',
        '      <SegmentTemplate startNumber="1" duration="10"',
        '          media="$Number$-$Time$-$Bandwidth$.mp4" />',
        '      <Representation bandwidth="100" />',
        '      <Representation bandwidth="200" />',
        '      <Representation bandwidth="300" />',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>'
      ].join('\n');

      fakeNetEngine.setResponseMapAsText({'dummy://foo': source});
      parser.start('dummy://foo', playerInterface)
          .then(function(actual) {
            expect(actual).toBeTruthy();

            var variants = actual.periods[0].variants;
            expect(variants.length).toBe(3);

            expect(variants[0].video.findSegmentPosition(0)).toBe(0);
            expect(variants[0].video.getSegmentReference(0)).toEqual(
                ManifestParser.makeReference('1-0-100.mp4', 0, 0, 10, baseUri));
            expect(variants[0].video.findSegmentPosition(12)).toBe(1);
            expect(variants[0].video.getSegmentReference(1)).toEqual(
                ManifestParser.makeReference('2-10-100.mp4', 1, 10,
                                             20, baseUri));
            expect(variants[1].video.findSegmentPosition(0)).toBe(0);
            expect(variants[1].video.getSegmentReference(0)).toEqual(
                ManifestParser.makeReference('1-0-200.mp4', 0, 0, 10, baseUri));
            expect(variants[1].video.findSegmentPosition(12)).toBe(1);
            expect(variants[1].video.getSegmentReference(1)).toEqual(
                ManifestParser.makeReference('2-10-200.mp4', 1, 10,
                                             20, baseUri));
            expect(variants[2].video.findSegmentPosition(0)).toBe(0);
            expect(variants[2].video.getSegmentReference(0)).toEqual(
                ManifestParser.makeReference('1-0-300.mp4', 0, 0, 10, baseUri));
            expect(variants[2].video.findSegmentPosition(12)).toBe(1);
            expect(variants[2].video.getSegmentReference(1)).toEqual(
                ManifestParser.makeReference('2-10-300.mp4', 1, 10,
                                             20, baseUri));
          }).catch(fail).then(done);
    });
  });

  describe('rejects streams with', function() {
    it('bad container type', function(done) {
      var source = [
        '<MPD mediaPresentationDuration="PT75S">',
        '  <Period>',
        '    <BaseURL>http://example.com</BaseURL>',
        '    <AdaptationSet mimeType="video/cats">',
        '      <Representation bandwidth="500">',
        '        <SegmentTemplate startNumber="1"',
        '            index="index-$Bandwidth$.webm"',
        '            initialization="init-$Bandwidth$.webm" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>'
      ].join('\n');
      var error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_UNSUPPORTED_CONTAINER);
      Dash.testFails(done, source, error);
    });

    it('no init data with webm', function(done) {
      var source = [
        '<MPD>',
        '  <Period duration="PT30S">',
        '    <BaseURL>http://example.com</BaseURL>',
        '    <AdaptationSet mimeType="video/webm">',
        '      <Representation bandwidth="500">',
        '        <SegmentTemplate startNumber="1"',
        '            index="index-$Bandwidth$.webm" />',
        '      </Representation>',
        '    </AdaptationSet>',
        '  </Period>',
        '</MPD>'
      ].join('\n');
      var error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_WEBM_MISSING_INIT);
      Dash.testFails(done, source, error);
    });

    it('not enough segment info', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="1" />'
      ]);
      var error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
      Dash.testFails(done, source, error);
    });

    it('no media template', function(done) {
      var source = Dash.makeSimpleManifestText([
        '<SegmentTemplate startNumber="1">',
        '  <SegmentTimeline>',
        '    <S d="10" />',
        '  </SegmentTimeline>',
        '</SegmentTemplate>'
      ]);
      var error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.DASH_NO_SEGMENT_INFO);
      Dash.testFails(done, source, error);
    });
  });
});

