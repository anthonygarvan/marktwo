import React from 'react';
import './Doc.scss'
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

let startIndex, endIndex, doc, allLines;

class Doc extends React.Component {
  constructor(props) {
    super(props);

    this.sync = this.sync.bind(this);
    this.getAllLines = this.getAllLines.bind(this);
    this.debouncedSync = _.debounce(() => !this.props.tryItNow ? this.sync(this.getAllLines()) : this.getAllLines(), 3000);
    this.handleScroll = this.handleScroll.bind(this);
    this.throttledScroll = _.throttle(this.handleScroll, 300);
    this.assembleDocFromMetaData = this.assembleDocFromMetaData.bind(this);
    this.enterEditMode = this.enterEditMode.bind(this);
    this.initializeEditor = this.initializeEditor.bind(this);

    TurndownService.prototype.escape = text => text; // disable escaping characters
    this.turndownService = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
    this.turndownService.use(gfm);
    marked.setOptions({
      breaks: true,
      smartLists: true,
    })

    doc = {};
    allLines = [];

    this.state = { initialHtml: props.initialData ? marked(props.initialData) : '<p><br /></p>' };
  }

  assembleDocFromMetaData(docMetadata) {
    // assemble document
    return new Promise(resolve => {
      Promise.all(docMetadata.pageIds.map(pageId => this.syncUtils.findOrFetch(pageId)))
      .then(pages => {
        if(pages.length) {
          const docList = _.flatten(pages)
          allLines = docList.map(d => d.id);
          const caretIndex = docMetadata.caretAt ? _.findIndex(docList, {id: docMetadata.caretAt}) : 0;
          startIndex = Math.max(caretIndex - 100, 0);
          endIndex = Math.min(caretIndex + 100, docList.length)
          const visibleDocList = _.slice(docList, startIndex, endIndex);
          document.querySelector('#m2-doc').innerHTML = visibleDocList.map(entry => marked(entry.text || '\u200B')).join('\n')
          Array.from(document.querySelector('#m2-doc').children).forEach((el, i) => {
            el.id = visibleDocList[i].id;
          });
          doc = {};
          docList.forEach(entry => doc[entry.id] = entry.text);
          const caretAtEl = document.getElementById(docMetadata.caretAt)
          if(caretAtEl) {
            caretAtEl.scrollIntoView();
            var range = document.createRange();
            var sel = window.getSelection();
            range.setStart(caretAtEl, 0);
            range.collapse(true);
            sel.removeAllRanges();
            sel.addRange(range);
            this.enterEditMode();
            this.oldSelectedBlock = $(caretAtEl);
          }
          resolve();
        } else {
          document.querySelector('#m2-doc').innerHTML = '<p><br /></p>';
          resolve();
        }
      });
    })
  }

  getAllLines() {
    let lines = [];
    const usedIds = {};
    $('#m2-doc > *').each((i, el) => {
      if(!el.id || el.id in usedIds) {
        el.id = shortid.generate();
        doc[el.id] = this.turndownService.turndown(el.outerHTML);
      }
      usedIds[el.id] = true;
      lines.push(el.id);
    })
    allLines = _.concat(_.slice(allLines, 0, startIndex), lines, _.slice(allLines, endIndex, allLines.length));
    return allLines;
  }

  sync(lines) {
    const sel = window.getSelection();

    // creates the authoritative definition of the document, a list of ids with text,
    // and stores as blocks of data keyed by the hash of the data.
    const pages = {};
    const pageIds = []
    _.chunk(lines.map(id => ({ id, text: doc[id]})), 100).map(page => {
      const hash = md5(stringify(page));
      const id = `${this.props.currentDoc}.${hash}`;
      pages[id] = page;
      pageIds.push(id);
    })


    const docMetadata = JSON.parse(localStorage.getItem(this.props.currentDoc));
    let caretAt = $(sel.anchorNode).closest('#m2-doc > *').attr('id') || docMetadata.caretAt;
    // cache all pageIds
    pageIds.map(pageId => localStorage.setItem(pageId, JSON.stringify(pages[pageId])))

    // update page caches
    // if the page isn't cached, cache it
    _.difference(pageIds, docMetadata.pageIds).map(pageId => {
      this.syncUtils.create(pageId, pages[pageId]);
    });

    // if the page has been removed, remove it
    _.difference(docMetadata.pageIds, pageIds).map(pageId => {
       localStorage.removeItem(pageId);
       // TODO, remove old pages from server
    });

    docMetadata.caretAt = caretAt;
    docMetadata.pageIds = pageIds;
    docMetadata.lastModified = new Date().toISOString();

    this.syncUtils.syncByRevision(this.props.currentDoc, docMetadata).then(validatedDocMetadata => {
      if(!_.isEqual(docMetadata.pageIds, validatedDocMetadata.pageIds)) {
        this.assembleDocFromMetaData(validatedDocMetadata);
      }
    });
  }

  enterEditMode() {
    const sel = window.getSelection();
    const originalAnchorText = (sel.anchorNode && sel.anchorNode.data) ? sel.anchorNode.data.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') : 0;
    const selectedBlock = $(sel.anchorNode).closest('#m2-doc > *');
    const anchorOffset = sel.anchorOffset;
    let renderedMarkdown;
    if(selectedBlock.attr('id')) {
      renderedMarkdown = doc[selectedBlock.attr('id')] || '<br />';
    } else {
      renderedMarkdown = this.turndownService.turndown(selectedBlock[0].outerHTML) || '<br />'
    }
    selectedBlock.html(renderedMarkdown);
    var range = document.createRange();
    let offset;
    if(selectedBlock[0].firstChild && selectedBlock[0].firstChild.data) {
      const stringMatch = selectedBlock[0].firstChild.data.match(new RegExp(originalAnchorText));
      const stringIndex = stringMatch ? stringMatch.index : 0;
      offset = stringIndex + anchorOffset;
      console.log('-------------------------');
      console.log(sel);
      console.log(anchorOffset);
      console.log(stringMatch);
      console.log(stringIndex);
    } else {
      offset = 0;
    }
    range.setStart(selectedBlock[0].firstChild, Math.min(offset, selectedBlock[0].firstChild.length));
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    selectedBlock.data('editMode', true);
    selectedBlock.addClass('m2-edit-mode');
  }

  handleScroll() {
    const scrollTop = $(window).scrollTop();
    const docHeight = $(document).height();
    const winHeight = $(window).height();
    const scrollPercent = (scrollTop) / (docHeight - winHeight);

    if(scrollPercent > 0.9 && endIndex < allLines.length) {
      const oldEndIndex = endIndex;
      endIndex = Math.min(endIndex + 100, allLines.length);
      const newHtml = _.slice(allLines, oldEndIndex, endIndex).map(id => {
        const newBlock = $(marked(doc[id]));
        newBlock.attr('id', id);
        return newBlock[0].outerHTML
      }).join('\n');
      $('#m2-doc > *:last-child').after(newHtml);
    }

    if(scrollPercent < 0.1 && startIndex > 0) {
      const oldStartIndex = startIndex;
      startIndex = Math.max(startIndex - 100, 0);
      const newHtml = _.slice(allLines, startIndex, oldStartIndex).map(id => {
        const newBlock = $(marked(doc[id]));
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
        endIndex = startIndex + 250;
      }

      if(scrollPercent > 0.8) {
        document.querySelectorAll(`#m2-doc > *:nth-child(-n+${document.querySelectorAll('#m2-doc > *').length - 250})`).forEach(el => {
          el.remove();
        });
        startIndex = endIndex - 250;
      }
    }
  }

  initializeEditor() {
    let selectedBlock;

    if(this.props.initialData) {
      const container = document.createElement('DIV');
      container.innerHTML = marked(this.props.initialData);
      allLines = [];
      $(container).children().each((i, el) => {
        el.id = shortid.generate();
        doc[el.id] = this.turndownService.turndown(el.outerHTML);
        allLines.push(el.id);
      })

      startIndex = 0;
      endIndex = Math.min(250, allLines.length);

      const initialHtml = _.slice(allLines, startIndex, endIndex).map(id => marked(doc[id])).join('\n');
      this.setState({ initialHtml });
    } else {
      this.setState({ initialHtml: '<p><br /></p>' });
    }
    $(window).on('scroll', (e) => {
      this.throttledScroll();
    })

    document.querySelector('#m2-doc').addEventListener('input', e => {
      if(e.inputType === 'deleteContentBackward') {
        const sel = window.getSelection();
        const selectedBlock = $(sel.anchorNode).closest('#m2-doc > *');

        if(!document.querySelector('#m2-doc > *')) {
          document.querySelector('#m2-doc').innerHTML = `<p id="${shortid.generate()}"><br /></p>`;
        }

        doc[selectedBlock[0].id] = this.turndownService.turndown(selectedBlock[0].outerHTML);
      }
    });

    $('#m2-doc').on('keydown keyup mouseup', (e) => {
      this.debouncedSync();

      if(selectedBlock) {
        this.oldSelectedBlock = selectedBlock;
      }

      let sel = window.getSelection();
      selectedBlock = $(sel.anchorNode).closest('#m2-doc > *');

      if(e.key === 'Enter' && e.type === 'keydown') {
        e.preventDefault();

        // if the current line is not empty, prevent default and continue the string in a newline
        if(selectedBlock && selectedBlock[0]
          && !((sel.anchorNode.data === '\n\u200B') || (sel.anchorNode.tagName === 'BR'))) {

        let range;
        if(sel.getRangeAt && sel.rangeCount) {
            range = sel.getRangeAt(0);
            range.deleteContents();
            range.insertNode(document.createTextNode('\n\u200B'));
            sel.anchorNode.nextSibling && sel.collapse(sel.anchorNode.nextSibling, sel.anchorNode.nextSibling.length);
        }
        } else {
          // if the line is empty, start a new paragraph
          const initialContent = sel.anchorNode.nextSibling && sel.anchorNode.nextSibling.data.replace(/\u200B/g, '');
          const id = shortid.generate();
          const newBlock = $(`<p id=${id}>${initialContent || '<br />'}</p>`);
          doc[id] = initialContent || '';
          const contentWithTextRemoved = doc[selectedBlock[0].id].replace(initialContent, '');
          selectedBlock[0].innerText = contentWithTextRemoved;
          newBlock.insertAfter(selectedBlock);
          sel.collapse(newBlock[0], 0);
        }
      }

      if(selectedBlock && selectedBlock[0] && !selectedBlock.data('editMode')) {
        setTimeout(this.enterEditMode, 50);
      }

      // save markdown
      if(this.oldSelectedBlock && this.oldSelectedBlock[0] && selectedBlock && selectedBlock[0]) {
        let markdown = this.oldSelectedBlock[0].innerText.replace(/\u200B/g, '');
        let id = this.oldSelectedBlock.attr('id');
        if(!id) {
          id = shortid.generate();
          this.oldSelectedBlock.attr('id', id);
        }
        doc[id] = markdown.trim();

        // and render it upon exiting the block
        if(!this.oldSelectedBlock[0].isSameNode(selectedBlock[0])) {
          const nodes = markdown.split('\n\n').map((block, i) => {
            let html = marked(block);
            const renderedNode = $(html.replace(/\\/g, '') || '<p><br /></p>');
            if(i > 0) {
              id = shortid.generate();
            }
            renderedNode.attr('id', id);
            doc[id] = block;

            return renderedNode[0].outerHTML;
          });
          this.oldSelectedBlock.replaceWith($(nodes.join('\n')));

        }
      }
    });
  }

  componentDidMount() {
    if(!this.props.tryItNow) {
      this.syncUtils = syncUtils(this.props.gapi);
      let docMetadataDefault = { pageIds: [], revision: 0 };

      this.syncUtils.initializeData(this.props.currentDoc, docMetadataDefault).then(docMetadata => {
        this.assembleDocFromMetaData(docMetadata).then(() => {
          this.initializeEditor();
          this.sync(this.getAllLines());
        })
      });
    } else {
      this.initializeEditor();
    }
  }


  render() {
    return <div><div id="m2-doc" className="m2-doc content" contentEditable="true" dangerouslySetInnerHTML={ {__html: this.state.initialHtml} }></div></div>
  }
}

export default Doc;
