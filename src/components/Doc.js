import React from 'react';
import './Doc.scss'
import './loading.scss';
import $ from 'jquery';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import _ from 'lodash';
import marked from 'marked';
import stringify from 'json-stringify-deterministic';
import md5 from 'md5';
import moment from 'moment';
import shortid from 'shortid';
import syncUtils from './syncUtils';
import syncUtilsOffline from './syncUtilsOffline';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBolt } from '@fortawesome/free-solid-svg-icons';
import { del, set } from 'idb-keyval';
import async from 'async';

class Doc extends React.Component {
  constructor(props) {
    super(props);

    this.sync = this.sync.bind(this);
    this.getAllLines = this.getAllLines.bind(this);
    this.syncQueue = async.queue((forceSync, callback) => {
      if (!this.props.tryItNow) {
        this.getAllLines()
        .then(lines => this.sync(lines, forceSync).then(() => {
          $('#m2-doc').removeClass('m2-syncing');
          $('#m2-loading').hide();
          callback();
        }).catch(err => {
            $('.m2-sync-failed').show();
            $('.m2-is-signed-out').show();
            callback();
        }));
      } else {
        this.getAllLines().then(() => {
          $('#m2-doc').removeClass('m2-syncing');
          callback();
        });
      }
    }, 1)

    const debounced = _.debounce(() => this.syncQueue.push(), 3000)

    this.initiateSync = (forceSync) => {
    const intentionallyOffline = props.offlineMode;
    const online = !props.offlineMode && props.gapi && props.gapi.auth2.getAuthInstance().isSignedIn.get();
    const lostConnection = !props.offlineMode && !(props.gapi && props.gapi.auth2.getAuthInstance().isSignedIn.get());

    if(online || intentionallyOffline) {
        $('.m2-is-signed-out').hide();
        $('#m2-doc').addClass('m2-syncing');
        if(forceSync) {
          this.syncQueue.push(true);
        } else {
          debounced();
        }
    } else {
      if(!this.props.tryItNow) {
        $('.m2-is-signed-out').show();
      }
    }
    }
    this.handleScroll = this.handleScroll.bind(this);
    this.throttledScroll = _.throttle(this.handleScroll, 500);
    this.getDocList = this.getDocList.bind(this);
    this.enterEditMode = this.enterEditMode.bind(this);
    this.initializeEditor = this.initializeEditor.bind(this);
    this.initializeFromDocList = this.initializeFromDocList.bind(this);

    TurndownService.prototype.escape = text => text; // disable escaping characters
    this.turndownService = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
    this.turndownService.use(gfm);
    marked.setOptions({
      gfm: true,
      breaks: true,
      smartLists: true,
    })

    this.state = { doc: {}, allLines: [] };
  }

  initializeFromDocList(docList, caretAt) {
    if(docList.filter(d => !d).length === 0) {
      const caretIndex = caretAt ? _.findIndex(docList, {id: caretAt}) : 0;
      const allLines = docList.map(d => d.id);
      const startIndex = Math.max(caretIndex - 100, 0);
      const endIndex = Math.min(caretIndex + 100, docList.length)
      const visibleDocList = _.slice(docList, startIndex, endIndex);

      document.querySelector('#m2-doc').innerHTML = visibleDocList.map(entry => this.getNodeForBlock(entry.text)[0].outerHTML).join('\n')
      Array.from(document.querySelector('#m2-doc').children).forEach((el, i) => {
        el.id = visibleDocList[i].id;
      });
      const doc = {};
      docList.forEach(entry => doc[entry.id] = entry.text);
      this.props.setDocData(allLines, doc);
      const caretAtEl = document.getElementById(caretAt);

      this.setState({ startIndex, endIndex, doc, allLines })
      setTimeout(() => {
        this.getAllLines().then(lines => {
          if(caretAtEl) {
            caretAtEl.scrollIntoView();
            $(window).scrollTop($(window).scrollTop() - 100);
            var range = document.createRange();
            var sel = window.getSelection();
            range.setStart(caretAtEl, 0);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            this.enterEditMode();
            this.oldSelectedBlock = $(caretAtEl);
          }
          if(!this.props.tryItNow && this.props.initialData) {
            this.sync(lines).then(() => $('#m2-loading').hide());
          } else {
            $('#m2-loading').hide();
          }
      })}, 25);
    } else {
      alert('Encountered an error, please reload');
    }
  }

  getDocList(docMetadata) {
    if(this.props.initialData) {
      // importing data, in tryit now mode or regular import
      let text = ''
      const docList = [];
      this.props.initialData.split('\n').forEach(nextLine => {
        nextLine = nextLine || '\n\u200B';
        if($(marked(`${text}\n${nextLine}`)).length > 1) {
          docList.push({ id: shortid.generate(), text: text.replace(/\u200B/g, '').trim() });
          text = '';
        }
        text += `\n${nextLine}`;
      })
      // add last element
      docList.push({ id: shortid.generate(), text });
      return new Promise(resolve => resolve(docList));
    } else {
      return new Promise(resolve => {
        this.syncUtils.findOrFetchFiles(docMetadata.pageIds)
        .then(pages => {
          if(pages.length) {
            const docList = _.flatten(pages);
            resolve(docList);
          } else {
            resolve([{ id: shortid.generate(), text: '' }]);
          }
        }).catch(e => console.log('could not find file'));
      })
    }
  }

  getAllLines() {
    let lines = [];
    const usedIds = {};
    const blocks = $('#m2-doc > *');
    const doc = _.clone(this.state.doc);
    blocks.each((i, el) => {
      if(!el.id || el.id in usedIds || !(el.id in doc)) {
        el.id = shortid.generate();
        doc[el.id] = this.turndownService.turndown(el.outerHTML);
      }
      usedIds[el.id] = true;
      lines.push(el.id);
    })
    const allLines = _.concat(_.slice(this.state.allLines, 0, this.state.startIndex), lines, _.slice(this.state.allLines, Math.min(this.state.endIndex, this.state.allLines.length), this.state.allLines.length));
    const endIndex = this.state.startIndex + blocks.length;
    return new Promise(resolve => {
        this.setState({ allLines, doc, endIndex });
        setTimeout(() => {
        this.props.setDocData(this.state.allLines, this.state.doc);
        $('#m2-doc').show(); // this is part of a bug fix, when importing data lines disappear before doc is initialized
        resolve(allLines);
      }, 50)
    })
  }

  sync(lines, forceSync) {
    const sel = window.getSelection();

    // creates the authoritative definition of the document, a list of ids with text,
    // and stores as blocks of data keyed by the hash of the data.
    const pages = {};
    let pageIds = [];

    const docMetadata = _.cloneDeep(this.state.docMetadata);

    let startIndex = 0;
    let i = 0;
    for(i = 0; i < docMetadata.pageIds.length; i++) {
      const page = _.slice(lines, startIndex, startIndex + docMetadata.pageLengths[i]).map(id => ({id, text: this.state.doc[id]}));
      const hash = md5(stringify(page));
      const id = `${this.props.currentDoc}.${hash}`;
      if(id === docMetadata.pageIds[i] && docMetadata.pageLengths[i] > 1000) {
        startIndex += docMetadata.pageLengths[i];
        pages[id] = page;
        pageIds.push(id);
      } else {
        break;
      }
    }

    let endIndex = lines.length;
    const endPageIds = [];
    for(let j = docMetadata.pageIds.length - 1; j > i; j--) {
      const page = _.slice(lines, endIndex - docMetadata.pageLengths[j], endIndex).map(id => ({id, text: this.state.doc[id]}));
      const hash = md5(stringify(page));
      const id = `${this.props.currentDoc}.${hash}`;
      if(id === docMetadata.pageIds[j]) {
        endIndex -= docMetadata.pageLengths[j];
        pages[id] = page;
        endPageIds.push(id);
      } else {
        break;
      }
    }

    let newLines = _.slice(lines, startIndex, endIndex).map(id => ({ id, text: this.state.doc[id]}));
    let chunkSize = Math.ceil(newLines.length / Math.ceil(newLines.length / 1500));

    _.chunk(newLines, chunkSize).map(page => {
      const hash = md5(stringify(page));
      const id = `${this.props.currentDoc}.${hash}`;
      pages[id] = page;
      pageIds.push(id);
    })

    pageIds = _.concat(pageIds, endPageIds);

    let caretAt = $(sel.anchorNode).closest('#m2-doc > *').attr('id') || docMetadata.caretAt;
    // cache all pageIds
    pageIds.map(pageId => {
      set(pageId, JSON.stringify(pages[pageId])).catch(() => console.log('storage full'))
    });

    // update page caches
    // if the page isn't cached, cache it
    const pagesToAdd = _.difference(pageIds, docMetadata.pageIds).map(pageId => ({name: pageId, data: pages[pageId]}));

    console.log('initial doc metadata');
    console.log(JSON.stringify(docMetadata));

    function executeSync(that, docMetadata) {
        return new Promise((resolve, reject) => {
          if(pagesToAdd.length || forceSync) {
            console.log('syncing...');
            if(pagesToAdd.length > 1) {
              $('#m2-loading').show();
            }
            // first add the new pages
            that.syncUtils.createFiles(pagesToAdd)
            .then(results => {
              // then update the metadata and docList.
              docMetadata.caretAt = caretAt;
              docMetadata.pageIds = pageIds;
              docMetadata.lastModified = new Date().toISOString();
              docMetadata.pageLengths = docMetadata.pageIds.map(pageId => pages[pageId].length);
              console.log('syncing by revision...');
              that.syncUtils.syncByRevision(that.props.currentDoc, docMetadata).then(validatedDocMetadata => {
                if(that._isMounted) {
                  that.setState({ docMetadata: validatedDocMetadata });
                  $('.m2-sync-failed').hide();
                  console.log('doc metadata:');
                  console.log(JSON.stringify(docMetadata));
                  console.log('validated:');
                  console.log(JSON.stringify(validatedDocMetadata));
                if(!_.isEqual(docMetadata.pageIds, validatedDocMetadata.pageIds)) {
                    console.log('out of date, updating docList...');
                    that.getDocList(validatedDocMetadata).then(docList => that.initializeFromDocList(docList, validatedDocMetadata.caretAt));
                  }
                }
              });
            })
            .then(results => {
              // then remove the unused pages
              const removeThese = _.difference(docMetadata.pageIds, pageIds)
              removeThese.map(pageId => {
                 del(pageId).catch(() => console.log('page not cached, did not remove.'));
              });
              return that.syncUtils.deleteFiles(removeThese).then(resolve);
            })
            .catch(err => reject());
          } else {
            resolve();
          }
        })
    }

    return executeSync(this, docMetadata);
  }

  componentWillUnmount() {
    this._isMounted = false;
    $('#m2-doc').off('input keydown paste keydown keyup mouseup');
    $(window).off('scroll focus');
  }

  enterEditMode() {
    const sel = window.getSelection();
    const originalAnchorText = (sel.anchorNode && sel.anchorNode.data) ? sel.anchorNode.data.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') : 0;
    const selectedBlock = $(sel.anchorNode).closest('#m2-doc > *');
    const anchorOffset = sel.anchorOffset;
    if(sel.anchorNode && selectedBlock && selectedBlock[0]) {
      let renderedMarkdown;
      if(selectedBlock.attr('id')) {
        renderedMarkdown = this.state.doc[selectedBlock.attr('id')] || '\u200B';
      } else {
        renderedMarkdown = this.turndownService.turndown(selectedBlock[0].outerHTML) || '\u200B'
      }
      selectedBlock.text(renderedMarkdown);
      var range = document.createRange();
      let offset;
      if(selectedBlock[0].firstChild && selectedBlock[0].firstChild.data) {
        const stringMatch = selectedBlock[0].firstChild.data.match(new RegExp(originalAnchorText));
        const stringIndex = stringMatch ? stringMatch.index : 0;
        offset = stringIndex + anchorOffset;
      } else {
        offset = 0;
      }
      range.setStart(selectedBlock[0].firstChild, Math.min(offset, selectedBlock[0].firstChild.length));
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      selectedBlock.data('editMode', true);
      document.querySelectorAll('.m2-edit-mode').forEach(el => {
        el.style = 'border-left: none;';
      })
      selectedBlock.addClass('m2-edit-mode');
      selectedBlock[0].style = '';

    }
  }

  handleScroll() {
    const scrollTop = $(window).scrollTop();
    const docHeight = $(document).height();
    const winHeight = $(window).height();
    const scrollPercent = (scrollTop) / (docHeight - winHeight);
    let startIndex = this.state.startIndex;
    let endIndex = this.state.endIndex;
    if(scrollPercent > 0.9 && endIndex < this.state.allLines.length) {
      const oldEndIndex = endIndex;
      endIndex = Math.min(endIndex + 100, this.state.allLines.length);
      const newHtml = _.slice(this.state.allLines, oldEndIndex, endIndex).map(id => {
        const newBlock = this.getNodeForBlock(this.state.doc[id]);
        newBlock.attr('id', id);
        return newBlock[0].outerHTML
      }).join('\n');
      $('#m2-doc > *:last-child').after(newHtml);
    }

    if(scrollPercent < 0.1 && startIndex > 0) {
      const oldStartIndex = startIndex;
      startIndex = Math.max(startIndex - 100, 0);
      const newHtml = _.slice(this.state.allLines, startIndex, oldStartIndex).map(id => {
        const newBlock = this.getNodeForBlock(this.state.doc[id]);
        newBlock.attr('id', id);
        return newBlock[0].outerHTML
      }).join('\n');
      $('#m2-doc > *:first-child').before(newHtml);
    }

    if((endIndex - startIndex) > 500) {
      const scrollTop = $(window).scrollTop();
      const docHeight = $(document).height();
      const winHeight = $(window).height();
      const scrollPercent = (scrollTop) / (docHeight - winHeight);

      if(scrollPercent < 0.2) {
        document.querySelectorAll(`#m2-doc>*:nth-child(n+250)`).forEach(el => {
          el.remove();
        });
        endIndex = this.state.startIndex + 250;
      }

      if(scrollPercent > 0.8) {
        document.querySelectorAll(`#m2-doc > *:nth-child(-n+${document.querySelectorAll('#m2-doc > *').length - 250})`).forEach(el => {
          el.remove();
        });
        startIndex = endIndex - 250;
      }
    }

    this.setState({ startIndex, endIndex });
  }

  getNodeForBlock(block) {
    let html = marked(block || '').replace(/\\/g, '');
    let renderedNode = $(html || '<p>\u200B</p>');
    const isVoidNode = new RegExp(/^(AREA|BASE|BR|COL|COMMAND|EMBED|HR|IMG|INPUT|KEYGEN|LINK|META|PARAM|SOURCE|TRACK|WBR)$/);
    if(isVoidNode.test(renderedNode[0].nodeName)) {
      renderedNode = $(`<div>${html}</div>`)
    }

    return renderedNode;
  }

  initializeEditor() {
    let selectedBlock;

    $(window).on('scroll', (e) => {
      this.throttledScroll();
    })

    $(window).on('focus', (e) => {
      this.initiateSync(true);
    })

    document.querySelector('#m2-doc').addEventListener('paste', () => setTimeout(this.getAllLines, 50))

    document.querySelector('#m2-doc').addEventListener('input', e => {
      if(e.inputType === 'deleteContentBackward') {
        if(!document.querySelector('#m2-doc > *')) {
          const id = shortid.generate();
          document.querySelector('#m2-doc').innerHTML = `<p id="${id}">\u200B</p>`;
          this.initializeFromDocList([{ id, text: '' }], id);
        } else {
          const sel = window.getSelection();
          const selectedBlock = $(sel.anchorNode).closest('#m2-doc > *');
          const doc = _.clone(this.state.doc);
          doc[selectedBlock[0].id] = this.turndownService.turndown(selectedBlock[0].outerHTML);
          this.setState({ doc });
        }
      }
    });

    $('#m2-doc').on('keydown keyup mouseup', (e) => {
      const doc = this.state.doc;
      this.initiateSync();

      if(selectedBlock) {
        this.oldSelectedBlock = selectedBlock;
      }

      let sel = window.getSelection();
      selectedBlock = $(sel.anchorNode).closest('#m2-doc > *');

      if(e.key === 'Tab' && e.type === 'keydown'){
        //add tab
        document.execCommand('insertHTML', false, '    ');
        //prevent focusing on next element
        e.preventDefault()
      }

      if(e.key === 'Enter' && e.type === 'keydown') {
        // if the current line is not empty, prevent default and continue the string in a newline
        if(selectedBlock && selectedBlock[0]) {
          e.preventDefault();
          if(selectedBlock[0].nodeName === 'PRE' || !((sel.anchorNode.data === '\n\u200B') || (sel.anchorNode.tagName === 'BR'))) {
            // do not start a new block
            let range;
            if(sel.getRangeAt && sel.rangeCount) {
                range = sel.getRangeAt(0);
                range.deleteContents();
                range.insertNode(document.createTextNode('\n\u200B'));
                sel.anchorNode.nextSibling && sel.collapse(sel.anchorNode.nextSibling, sel.anchorNode.nextSibling.length);
            }
          } else {
            // if the line is empty, start a new block
            const initialContent = sel.anchorNode.nextSibling && sel.anchorNode.nextSibling.data.replace(/\u200B/g, '').trim();
            const id = shortid.generate();
            const newBlock = $(`<p id=${id}>${initialContent || '\u200B'}</p>`);
            doc[id] = initialContent || '';
            const contentWithTextRemoved = doc[selectedBlock[0].id].replace(initialContent, '');
            selectedBlock[0].innerText = contentWithTextRemoved;
            newBlock.insertAfter(selectedBlock);
            sel.collapse(newBlock[0], 0);
          }
      }
    }

      if(selectedBlock && selectedBlock[0] && !selectedBlock.data('editMode')) {
        this.enterEditMode();
      }

      // save markdown
      if(this.oldSelectedBlock && this.oldSelectedBlock[0] && selectedBlock && selectedBlock[0]) {
        let markdown = this.oldSelectedBlock[0].innerText.replace(/\u200B/g, '');
        let id = this.oldSelectedBlock.attr('id');
        if(!id || !this.oldSelectedBlock[0].isSameNode(document.getElementById(id))) {
          id = shortid.generate();
          this.oldSelectedBlock.attr('id', id);
        }
        doc[id] = markdown.trim();

        // and render it upon exiting the block
        if(!this.oldSelectedBlock[0].isSameNode(selectedBlock[0])) {
          const blocks = this.oldSelectedBlock[0].nodeName === 'PRE' ? [markdown] : markdown.split('\n\n');
          const nodes = blocks.map((block, i) => {
            block = block.replace(/\/now/gi, moment().format('LLL'));
            block = block.replace(/\/today/gi, moment().format('LL'));

            const renderedNode = this.getNodeForBlock(block);
            if(i > 0) {
              id = shortid.generate();
            }
            renderedNode.attr('id', id);
            doc[id] = block.trim();

            return renderedNode[0].outerHTML;
          });
          this.oldSelectedBlock.replaceWith($(nodes.join('\n')));

        }
        this.setState({ doc }, () => {
          this.props.setDocData(this.state.allLines, this.state.doc);
        });
      }
    });
  }

  shouldComponentUpdate(nextProps, nextState) {
    if(this.props.goToBlock !== nextProps.goToBlock) {
        const docList = this.state.allLines.map(id => ({ id, text: this.state.doc[id] }));
        this.initializeFromDocList(docList, nextProps.goToBlock);
    }

    this.syncUtils = this.props.offlineMode ? syncUtilsOffline() : syncUtils(this.props.gapi);
    // Due to the complexities of cross-platform editing of html in react, this component is not
    // a "real" react component - it's stitched together with jquery and raw html.
    // However, key variables are still scoped to hang off of state, in order to take advantage of
    // the component lifecycle logic built into react.
    // I fully disable rendering for performance reasons.
    return false;
  }

  componentDidMount() {
    this._isMounted = true;
    $('#m2-doc').hide();
    if(!this.props.tryItNow) {
      this.syncUtils = (this.props.offlineMode || !this.props.gapi) ? syncUtilsOffline() : syncUtils(this.props.gapi);
      let docMetadataDefault = { pageIds: [], revision: 0, pageLengths: [] };

      this.syncUtils.initializeData(this.props.currentDoc, docMetadataDefault).then(docMetadata => {
        if(this._isMounted) {
          this.setState({ docMetadata });
          this.getDocList(docMetadata).then((docList) => {
            if(this._isMounted) {
              this.initializeEditor();
              this.initializeFromDocList(docList, docMetadata.caretAt);
            }
          })
        }
      });
    } else {
      this.getDocList().then((docList) => {
        this.initializeEditor();
        this.initializeFromDocList(docList, docList[0].id);
        $('#m2-loading').hide()
      })
    }
  }


  render() {
    return <div>
      <div id="m2-loading" className="m2-loading">
        <div className="bar"></div>
        <div className="bar"></div>
        <div className="bar"></div>
      </div>
      <div className="m2-sync-failed" style={ {display: 'none' } }><FontAwesomeIcon icon={faBolt} /></div>
      <div className="m2-is-signed-out" style={ {display: 'none' } }>You've been signed out. <a onClick={this.props.handleLogin}>Sign back in</a></div>
      <div id="m2-doc" className="m2-doc content" contentEditable="true"></div></div>
  }
}

export default Doc;
