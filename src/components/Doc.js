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
import { faBolt, faTimes } from '@fortawesome/free-solid-svg-icons';
import { del, set, keys } from 'idb-keyval';
import async from 'async';
import emoji from 'emoji-dictionary';
import dialogPolyfill from 'dialog-polyfill';

class Doc extends React.Component {
  constructor(props) {
    super(props);

    this.sync = this.sync.bind(this);
    this.getAllLines = this.getAllLines.bind(this);
    this.bindCheckboxEvents = this.bindCheckboxEvents.bind(this);
    this.showReminders = this.showReminders.bind(this);
    this.viewReminder = this.viewReminder.bind(this);
    this.closeReminder = this.closeReminder.bind(this);
    this.syncQueue = async.queue((forceSync, callback) => {
      if (!this.props.tryItNow) {
        this.getAllLines()
        .then(lines => this.sync(lines, forceSync).then(() => {
          $('#m2-doc').removeClass('m2-syncing');
          $('#m2-loading').hide();
          callback();
        }).catch(err => {
            !this.props.offlineMode && $('.m2-is-signed-out').show();
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
      this.bindCheckboxEvents();
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
    const linesBefore = _.slice(this.state.allLines, 0, this.state.startIndex);
    const linesAfter = _.slice(this.state.allLines, Math.min(this.state.endIndex, this.state.allLines.length), this.state.allLines.length);
    _.concat(linesBefore, linesAfter).forEach(id => usedIds[id] = true);

    const blocks = $('#m2-doc > *');
    const doc = _.clone(this.state.doc);
    blocks.each((i, el) => {
      if(!el.id || el.id in usedIds || !(el.id in doc)) {
        el.id = shortid.generate();
        doc[el.id] = this.turndownService.turndown(el.outerHTML);
      }
      usedIds[el.id] = true;
      lines.push(el.id);
    });
    const allLines = _.concat(linesBefore, lines, linesAfter);
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
    console.log(`is signed in: ${this.props.gapi.auth2.getAuthInstance().isSignedIn.get()}`);

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

    console.log('syncing...');
    if(pagesToAdd.length > 1) {
      $('#m2-loading').show();
    }
    // first add the new pages
    return this.syncUtils.createFiles(pagesToAdd)
    .then(results => {
      // then update the metadata and docList.
      docMetadata.caretAt = caretAt;
      docMetadata.pageIds = pageIds;
      docMetadata.lastModified = new Date().toISOString();
      docMetadata.pageLengths = docMetadata.pageIds.map(pageId => pages[pageId].length);
      console.log('syncing by revision...');
      console.log(`is signed in: ${this.props.gapi.auth2.getAuthInstance().isSignedIn.get()}`);
      return new Promise((resolve, reject) => {
        this.syncUtils.syncByRevision(this.props.currentDoc, docMetadata).then(validatedDocMetadata => {
          if(this._isMounted) {
            this.setState({ docMetadata: validatedDocMetadata }, resolve);
            console.log('doc metadata:');
            console.log(JSON.stringify(docMetadata));
            console.log('validated:');
            console.log(JSON.stringify(validatedDocMetadata));
          if(!_.isEqual(docMetadata.pageIds, validatedDocMetadata.pageIds)) {
              console.log('out of date, updating docList...');
              this.getDocList(validatedDocMetadata).then(docList => this.initializeFromDocList(docList, validatedDocMetadata.caretAt));
            }
          }
      }).catch(e => reject())
      })
    })
    .then(results => keys())
    .then(keys => {
      // then remove the unused pages
      const localPages = keys.filter(k => k.startsWith(`${this.props.currentDoc}.`));
      const removeThese = _.difference(localPages, this.state.docMetadata.pageIds)
      removeThese.map(pageId => {
         del(pageId).catch(() => console.log('page not cached, did not remove.'));
      });
    })
    .then(() => {
      return this.syncUtils.getPagesForDoc(this.props.currentDoc);
    })
    .then(remotePages => {
      const removeThese = _.difference(remotePages, this.state.docMetadata.pageIds)
      return this.syncUtils.deleteFiles(removeThese);
    })
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
      this.bindCheckboxEvents();
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
      this.bindCheckboxEvents();
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

    // Pre-process reminders
    block = block.split('\n').map(line => {
      if(/(?:[\-\*\+]|(?:[0-9]+\.))\s+\[\s\]\s.*🎗.*;/.test(line)) {
        let matchedDate = moment(line.match(/(?:[\-\*\+]|(?:[0-9]+\.))\s+\[\s\]\s.*🎗(.*);/)[1]);
        if(matchedDate.isValid()) {
          line = line.replace(/🎗.*;/, (reminderText) => {
            return `<span class="m2-reminder-text">${reminderText}</span>`
          });
        }
      }
      return line
    }).join('\n');


    const mentionOrHashtagRegex = new RegExp("(?:^([#@][^\\s#@]+))|(?:[\\s\u200B]([#@][^\\s#@]+))", 'g')
    block = block.replace(mentionOrHashtagRegex, mentionOrHashtag => {
      const html = `<button contenteditable="false" onclick="handleMentionOrHashtagSearch('${mentionOrHashtag.trim()}')" class="m2-mention-hashtag">${mentionOrHashtag.trim()}</button>`;
      return mentionOrHashtag.startsWith(' ') ? ` ${html}` : html;
    });


    let html = marked(block || '').replace(/\\/g, '');
    let renderedNode = $(html || '<p>\u200B</p>');
    const isVoidNode = new RegExp(/^(AREA|BASE|BR|COL|COMMAND|EMBED|HR|IMG|INPUT|KEYGEN|LINK|META|PARAM|SOURCE|TRACK|WBR)$/);
    if(isVoidNode.test(renderedNode[0].nodeName)) {
      renderedNode = $(`<div>${html}</div>`)
    }

    let checkboxes = renderedNode.find('input[type=checkbox]');
    checkboxes.each((i, el) => {
      el.replaceWith($(`<span contenteditable="false" idx="${i}">${el.outerHTML}</span>`)[0]);
    })
    renderedNode.find('input[type=checkbox]').attr('disabled', false);
    renderedNode.find('input[type=checkbox]').closest('li').addClass('m2-todo-list')
    renderedNode.find('input[checked]').closest('li').addClass('m2-todo-done')

    renderedNode.find('a').attr('contenteditable', false).attr('target', '_blank');

    if(block.startsWith('// ')) {
      renderedNode = $(`<div class="m2-bookmark">${block.replace('// ', '')}<hr /></div>`)
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
      this.showReminders();
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

          if(selectedBlock && selectedBlock[0]) {
            const doc = _.clone(this.state.doc);
            doc[selectedBlock[0].id] = this.turndownService.turndown(selectedBlock[0].outerHTML);
            this.setState({ doc });
          }
        }
      }
    });
    const that = this;
    const modal = document.querySelector('#m2-img-dialog');
    dialogPolyfill.registerDialog(modal);

    modal.querySelector('#m2-img-cancel').addEventListener('click', () => {
      modal.close();
    });

    modal.querySelector('#m2-img-select').addEventListener('click', () => {
      modal.close($(modal.querySelector('input')).data('webUrl'));
    });

    modal.querySelector('input').addEventListener('change', function(e) {
      $('#m2-img-select').addClass('is-loading');
      if (e.target.files && e.target.files[0]) {
          var reader = new FileReader();

          const fileName = e.target.files[0].name;
          reader.onload = function(e) {
              console.log(e.target.result);
              that.syncUtils.createImage(`m2img.${fileName}`, e.target.result)
              .then(result => {
                console.log(result);
                $(modal.querySelector('input')).data('webUrl', `https://drive.google.com/uc?export=view&id=${result.id}`);
                $('#m2-img-select').removeClass('is-loading');
                $('#m2-img-select').attr('disabled', null);
              });
          };

          reader.readAsDataURL(e.target.files[0]);
          console.log(e.target.files[0].name);
      }
    });

    modal.addEventListener('close', () => {
      const sel = window.getSelection();
      const caretAt = $('#m2-img-dialog').data('selectedBlock')
      this.state.doc[caretAt] = this.state.doc[caretAt].replace('/m2img', `![alt-text](${modal.returnValue || 'imgUrl'})`);
      this.setState({ doc: this.state.doc }, () => {
        this.initializeFromDocList(this.state.allLines.map(id => ({ id, text: this.state.doc[id] })), caretAt);
      });
      modal.returnValue = '';
      $('#m2-img-select').attr('disabled', true);
      modal.querySelector('input').value = null;
    });

    const dateModal = document.querySelector('#m2-date-dialog');
    dialogPolyfill.registerDialog(dateModal);

    dateModal.querySelector('#m2-date-cancel').addEventListener('click', () => {
      dateModal.close();
    });

    dateModal.querySelector('#m2-date-select').addEventListener('click', () => {
      dateModal.close($(dateModal.querySelector('input')).val());
    });

    dateModal.addEventListener('close', () => {
      const sel = window.getSelection();
      const caretAt = $('#m2-date-dialog').data('selectedBlock')
      this.state.doc[caretAt] = this.state.doc[caretAt].replace('/m2date', dateModal.returnValue ? moment(dateModal.returnValue).format('LL') : '');
      this.setState({ doc: this.state.doc }, () => {
        this.initializeFromDocList(this.state.allLines.map(id => ({ id, text: this.state.doc[id] })), caretAt);
      });
      dateModal.returnValue = '';
      dateModal.querySelector('input').value = null;
    });


    let autocompleteActive = false;
    let autocompleteSelectedIndex = 0;
    let autocompleteDropdownAbove;
    $('#m2-doc').on('keydown keyup mouseup', (e) => {
      const doc = this.state.doc;
      this.initiateSync();
      const that = this;

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

      const s = sel.anchorNode && sel.anchorNode.data && sel.anchorNode.data.substring(sel.anchorOffset - 50, sel.anchorOffset)
      const autocompleteRegex = new RegExp("(?:^([#@:/][^\\s#@]*$))|(?:[\\s\u200B]([#@:/][^\\s#@]*$))")
      const slashCommands = ['/now', '/today', '/tomorrow', '/image', '/date'];
      if(autocompleteRegex.test(s)) {
        $('#m2-autocomplete').show();
        const matchedText = s.match(autocompleteRegex)[0].replace('\u200B', '').trim();
        let results;
        if(matchedText.startsWith(':')) {
          var emojiRegex = new RegExp(`${matchedText.replace(/:/g, '')}`, 'i');
          results = emoji.names.filter(n => n.match(emojiRegex))
          results = results.map(r => `${emoji.getUnicode(r)} ${r}`)
        } else if(matchedText.startsWith('/')) {
          results = slashCommands.filter(s => s.startsWith(matchedText));
        } else {
          const findRegex = new RegExp(`(?:[\\s]|^)${matchedText}[^\\s#@]+|^${matchedText}[^\\s#@]+`, 'g')
          results = _.uniq(_.flatten(this.state.allLines.map(id => id !== selectedBlock[0].id && this.state.doc[id].match(findRegex)).filter(r => r)));
        }

        results = results.slice(0, 10);

        $('#m2-autocomplete').html(results.map(r => `<div>${r.trim()}</div>`).join('\n'))
        autocompleteSelectedIndex && $(`#m2-autocomplete div:nth-child(${autocompleteSelectedIndex})`).addClass('m2-selected');

        $('#m2-autocomplete div').hover(function() {
          $('#m2-autocomplete div').removeClass('m2-selected');
          $(this).addClass('m2-selected');
          autocompleteSelectedIndex = $('#m2-autocomplete div').index(this);
        });

        function verticalPositionAutocomplete() {
          if(autocompleteActive) {
            const range = sel.getRangeAt(0).cloneRange();
            const rects = range.getClientRects();
            if (rects.length > 0) {
              let vPos;
              autocompleteDropdownAbove = rects[0].top / window.outerHeight < 0.6;
              if(autocompleteDropdownAbove) {
                vPos = rects[0].top + 20;
              } else {
                vPos = rects[0].top - (10 + $('#m2-autocomplete').height());
              }
              $('#m2-autocomplete').css('top', vPos);
            }
          }
        }

        verticalPositionAutocomplete();

        if(!autocompleteActive) {
          const range = sel.getRangeAt(0).cloneRange();
          const rects = range.getClientRects();
          if (rects.length > 0) {
              $('#m2-autocomplete').css('left', rects[0].left - (10 *  matchedText.length))
          }
        }

        function selectEntry() {
          $(sel.anchorNode)[0].parentElement.normalize();
          sel = window.getSelection();
          const anchorNode = $(sel.anchorNode)[0];
          const caretOffset = sel.anchorOffset
          const endOfWord = sel.anchorNode.data.substring(sel.anchorOffset).match(/[^\s]*/);
          const endOffset = endOfWord ? caretOffset + endOfWord[0].length : caretOffset;
          const startOffset = endOfWord ? endOffset - (matchedText.length + endOfWord[0].length) : endOffset - matchedText.length;
          sel.removeAllRanges();
          let range = document.createRange();
          range.setStart(anchorNode, startOffset);
          range.setEnd(anchorNode, endOffset);
          sel.addRange(range);

          let newText = results[autocompleteSelectedIndex - 1];
          if(newText.split(' ')[1] && emoji.getUnicode(newText.split(' ')[1])) {
            newText = emoji.getUnicode(newText.split(' ')[1]);
          }

          if(newText.startsWith('/')) {
            switch(newText) {
              case '/now':
                newText = moment().format('LLL');
                break;
              case '/today':
                newText = moment().format('LL');
                break;
              case '/tomorrow':
                newText = moment().add(1, 'day').format('LL');
                break;
              case '/image':
                if(!that.props.offlineMode) {
                  newText = '/m2img';
                } else {
                  newText = '![alt-text](imgUrl)';
                }
                break;
              case '/date':
                newText = '/m2date';
                break;
            }
          }
          document.execCommand('insertHTML', false, `${newText} `);

          $('#m2-doc').focus();
          autocompleteActive = false;
          $('#m2-autocomplete').hide();
          range = document.createRange();
          sel = window.getSelection();
          const parent = $(sel.anchorNode)[0].parentElement;
          parent.normalize();
          range.setStart(parent.firstChild, startOffset + newText.length + 1);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);

          if(newText === '/m2img') {
            const modal = $('#m2-img-dialog');
            modal.data('selectedBlock', $(sel.anchorNode).closest('#m2-doc > *').attr('id'));
            modal[0].showModal();
          }

          if(newText === '/m2date') {
            const modal = $('#m2-date-dialog');
            modal.data('selectedBlock', $(sel.anchorNode).closest('#m2-doc > *').attr('id'));
            modal[0].showModal();
          }
        }

        $('#m2-autocomplete div').mousedown(function(e) {
          e.preventDefault();
          e.stopPropagation();
          $('#m2-autocomplete div').removeClass('m2-selected');
          $(this).addClass('m2-selected');
          autocompleteSelectedIndex = $('#m2-autocomplete div').index(this) + 1;
          selectEntry();
        });

        $('#m2-autocomplete div').click(e => e.preventDefault());


        $(window).on('scroll', verticalPositionAutocomplete);
        autocompleteActive = true;

        if(e.key == 'ArrowDown' && e.type === 'keydown' && results.length) {
          autocompleteSelectedIndex++;
          if(!autocompleteDropdownAbove) {
            // let caret move down
            if(autocompleteSelectedIndex <= results.length) {
              e.preventDefault();
            }
          } else {
            // wrap around
            autocompleteSelectedIndex = autocompleteSelectedIndex > results.length ? 1 : autocompleteSelectedIndex;
            e.preventDefault();
          }
        }

        if(e.key == 'ArrowUp' && e.type === 'keydown' && results.length) {
          autocompleteSelectedIndex--;
          if(!autocompleteDropdownAbove) {
            // wrap around
            autocompleteSelectedIndex = autocompleteSelectedIndex < 1 ? results.length : autocompleteSelectedIndex;
            e.preventDefault();
          } else {
            // let the caret move up
            autocompleteSelectedIndex = Math.max(autocompleteSelectedIndex, 0);
            if(autocompleteSelectedIndex !== 0) {
              e.preventDefault();
            }
          }
        }

        if(e.key == 'Enter' && e.type === 'keydown') {
          e.preventDefault();
          if(autocompleteSelectedIndex > 0 && autocompleteSelectedIndex <= results.length) {
            selectEntry();
          }
        }
      } else {
        $('#m2-autocomplete').hide();
        autocompleteActive = false;
        autocompleteSelectedIndex = 0;
      }

      if(e.key === 'Enter' && e.type === 'keydown') {
        e.preventDefault(); // testing this
        selectedBlock[0].innerText = "TESTING";
        // if the current line is not empty, prevent default and continue the string in a newline
        if(selectedBlock && selectedBlock[0] && !(autocompleteSelectedIndex > 0)) {
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
            let initialContent = sel.anchorNode.nextSibling && sel.anchorNode.nextSibling.data && sel.anchorNode.nextSibling.data.replace(/\u200B/g, '').trim();
            initialContent += `--${sel.anchorNode.data}--|--${sel.anchorNode.tagName}--`;
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
            block = block.replace(/\/tomorrow/gi, moment().add(1, 'day').format('LL'));

            const renderedNode = this.getNodeForBlock(block);
            if(i > 0) {
              id = shortid.generate();
            }
            renderedNode.attr('id', id);
            doc[id] = block.trim();

            return renderedNode[0].outerHTML;
          });
          this.oldSelectedBlock.replaceWith($(nodes.join('\n')));
          this.bindCheckboxEvents();
        }
        this.setState({ doc }, () => {
          this.props.setDocData(this.state.allLines, this.state.doc);
        });
      }
    });

    $('#m2-doc').on('focusout', (e) => {
      const oldSelectedBlock = $('.m2-edit-mode');
      if(oldSelectedBlock[0]) {
        let markdown = oldSelectedBlock[0].innerText.replace(/\u200B/g, '');
        let id = oldSelectedBlock.attr('id');
        if(!id || !oldSelectedBlock[0].isSameNode(document.getElementById(id))) {
          id = shortid.generate();
          oldSelectedBlock.attr('id', id);
        }
        const doc = this.state.doc;
        doc[id] = markdown.trim();

        const blocks = oldSelectedBlock[0].nodeName === 'PRE' ? [markdown] : markdown.split('\n\n');
        const nodes = blocks.map((block, i) => {
          block = block.replace(/\/now/gi, moment().format('LLL'));
          block = block.replace(/\/today/gi, moment().format('LL'));
          block = block.replace(/\/tomorrow/gi, moment().add(1, 'day').format('LL'));

          const renderedNode = this.getNodeForBlock(block);
          if(i > 0) {
            id = shortid.generate();
          }
          renderedNode.attr('id', id);
          doc[id] = block.trim();

          return renderedNode[0].outerHTML;
        });
        oldSelectedBlock.replaceWith($(nodes.join('\n')));
        this.bindCheckboxEvents();
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
    (this.props.offlineMode && !this.props.tryItNow) ? $('.m2-offline').show() : $('.m2-offline').hide();
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
      this.syncUtils = this.props.offlineMode ? syncUtilsOffline() : syncUtils(this.props.gapi);
      (this.props.offlineMode && !this.props.tryItNow) ? $('.m2-offline').show() : $('.m2-offline').hide();
      let docMetadataDefault = { pageIds: [], revision: 0, pageLengths: [] };

      this.syncUtils.initializeData(this.props.currentDoc, docMetadataDefault).then(docMetadata => {
        if(this._isMounted) {
          this.setState({ docMetadata });
          this.getDocList(docMetadata).then((docList) => {
            if(this._isMounted) {
              this.initializeEditor();
              this.initializeFromDocList(docList, docMetadata.caretAt || docList[0].id);
              this.showReminders();
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

  bindCheckboxEvents() {
    const that = this;
    $(`input[type=checkbox]`).change(function() {
      this.checked ? $(this).closest('li').addClass('m2-todo-done') : $(this).closest('li').removeClass('m2-todo-done');

      const lines = [];
      let idx = 0;
      const id = $(this).closest('#m2-doc>*')[0].id
      that.state.doc[id].split('\n')
        .forEach(line => {
          if(/(?:[\-\*\+]|(?:[0-9]+\.))\s+\[[x\s]\]/.test(line)) {
            if(idx == parseInt(this.parentElement.getAttribute('idx'))) {
              if(this.checked) {
                line = line.replace(/(?:[\-\*\+]|(?:[0-9]+\.))\s+\[\s\]/, match => match.replace('[ ]', '[x]'));
              } else {
                line = line.replace(/(?:[\-\*\+]|(?:[0-9]+\.))\s+\[x\]/, match => match.replace('[x]', '[ ]'));
              }
            }
            idx++;
          }
          lines.push(line);
        })

      that.state.doc[id] = lines.join('\n')

      that.setState({ doc: that.state.doc }, () => {
        that.props.setDocData(that.state.allLines, that.state.doc);
        that.initiateSync();
      });
    })
  }

  showReminders() {
    let hours = 24;
    let saved = sessionStorage.getItem('saved')

    if(!saved) {
      sessionStorage.setItem('saved', new Date().getTime());
    }

    if (saved && (new Date().getTime() - parseInt(saved) > hours * 60 * 60 * 1000)) {
      sessionStorage.clear()
    }

    let shownReminders = sessionStorage.getItem('shownReminders');
    shownReminders = shownReminders ? JSON.parse(shownReminders) : [];

    const lines = [];
    this.state.allLines.forEach(id => {
      this.state.doc[id].split('\n').forEach(text => {
        lines.push({ id, text });
      });
    });

    const reminders = lines.filter(lineObj => {
      return /(?:[\-\*\+]|(?:[0-9]+\.))\s+\[\s\]\s.*🎗.*;/.test(lineObj.text)
    }).map((lineObj, i) => {
      let match = lineObj.text.match(/(?:[\-\*\+]|(?:[0-9]+\.))\s+\[\s\]\s(.*)🎗(.*);/)
      let date = moment(match[2]);
      let snippet = match[1];
      return {id: `${lineObj.id}.${i}`, date, snippet};
    }).filter(reminder => {
      return reminder.date.isBefore(moment())
    }).filter(reminder => {
      return shownReminders.indexOf(reminder.id) === -1;
    })

    if(reminders.length) {
      $('#m2-reminder').attr('reminderId', reminders[0].id);
      $('#m2-reminder em').text(reminders[0].snippet);
      $('#m2-reminder').show();
    } else {
      $('#m2-reminder').hide();
    }
  }

  viewReminder() {
    let shownReminders = sessionStorage.getItem('shownReminders');
    shownReminders = shownReminders ? JSON.parse(shownReminders) : [];
    const reminderId = $('#m2-reminder').attr('reminderId');
    shownReminders.push(reminderId);
    sessionStorage.setItem('shownReminders', JSON.stringify(shownReminders));
    const docList = this.state.allLines.map(id => ({ id, text: this.state.doc[id] }));
    this.initializeFromDocList(docList, reminderId.split('.')[0]);
    this.showReminders();
  }

  closeReminder() {
    let shownReminders = sessionStorage.getItem('shownReminders');
    shownReminders = shownReminders ? JSON.parse(shownReminders) : [];
    const reminderId = $('#m2-reminder').attr('reminderId');
    shownReminders.push(reminderId);
    sessionStorage.setItem('shownReminders', JSON.stringify(shownReminders));
    this.showReminders();
  }


  render() {
    return <div>
      <div id="m2-loading" className="m2-loading">
        <div className="bar"></div>
        <div className="bar"></div>
        <div className="bar"></div>
      </div>
      <dialog id="m2-img-dialog" className="content">
        <h3>Please select an image...</h3>
        <p><input type="file" accept="image/*" /></p>
        <div className="actions is-pulled-right">
          <button id="m2-img-cancel" className="button is-text">cancel</button>
          <button id="m2-img-select" className="button" disabled>Ok</button>
        </div>
      </dialog>

      <dialog id="m2-date-dialog" className="content">
        <h3>Please select a date...</h3>
        <p><input type="date" /></p>
        <div className="actions is-pulled-right">
          <button id="m2-date-cancel" className="button is-text">cancel</button>
          <button id="m2-date-select" className="button">Ok</button>
        </div>
      </dialog>
      <div id="m2-autocomplete" style={ { display: 'none' } }></div>
      <div className="m2-offline" style={ {display: 'none' } }><FontAwesomeIcon icon={faBolt} /></div>
      <div className="m2-is-signed-out" style={ {display: 'none' } }>You've been signed out. <a onClick={this.props.handleLogin}>Sign back in</a></div>
      <div className="m2-reminder" id="m2-reminder" style={ {display: 'none' } }>
        <div>You have a reminder. <a onClick={this.viewReminder}>View</a></div>
        <div className="m2-reminder-snippet"><em></em></div>
        <a className="m2-close-reminder" onClick={this.closeReminder}><FontAwesomeIcon icon={faTimes} /></a></div>
      <div id="m2-doc" className="m2-doc content" contentEditable="true"></div></div>
  }
}

export default Doc;
