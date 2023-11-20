import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import html2canvas from 'html2canvas';
import classNames from 'classnames';
import { BlendMode, PDFDocument } from 'pdf-lib'
import imageCompression from 'browser-image-compression';
import { Button, Form, Input, Message, Checkbox, Radio, NumericInput, Alert, Pagination, Icon, Popover } from 'adui'
import { TransformComponent, TransformWrapper, ReactZoomPanPinchRef, useControls } from 'react-zoom-pan-pinch'
import { debounce, throttle } from 'lodash'
import axios from 'axios'
import { Buffer } from 'buffer';
import './App.css';
import { waterMarkData, sizeData, ISizeData } from './data'
const work = require('pdfjs-dist/build/pdf.worker')
// import './pdfjsWorkerSetup.js';
pdfjsLib.GlobalWorkerOptions.workerSrc = work

type SizeDataKeys = keyof ISizeData

interface WatermarkUnitData {
  base64Data: string
  bufferData: ArrayBuffer | string,
  nums: number
}

interface ImageData {
  width: number
  height: number
  canvas: HTMLCanvasElement
}

const getDomCanvas = async <T extends HTMLElement,>(dom: T, devicePixelRatio: number) => {
  const canvasdom = document.createElement("canvas");
  const width = parseInt(`${dom.clientWidth}`, 10);
  const height = parseInt(`${dom.clientHeight}`, 10);
  const scaleBy = devicePixelRatio;
  canvasdom.width = width * scaleBy;
  canvasdom.height = height * scaleBy;
  const canvas = await html2canvas(dom, {
    canvas: canvasdom,
    scale: scaleBy,
    backgroundColor: null,
    useCORS: true
  });
  return canvas
}

const base64ToImage = (base64: string) => {
  return new Promise((resolve: (value: HTMLImageElement) => void, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = base64;
    img.onload = () => {
      resolve(img)
    }
    img.onerror = (event) => {
      reject(event)
    }
  }).then((value: HTMLImageElement) => { return value }).catch((event) => { throw event })
}


const App: React.FC = () => {
  const [file, setFile] = useState<ArrayBuffer | string>('')
  const [fileName, setFileName] = useState('')
  const [watermarkUnit, setWatermarkUnit] = useState<WatermarkUnitData | null>(null)
  const [imageList, setImageList] = useState<ImageData[]>([])
  const [currentImage, setCurrentImage] = useState(0)
  const [waterMarkValue, setWaterMarkValue] = useState<Array<string>>([])
  const [selectedPages, setSelectedPages] = useState<number[]>([])
  const [slideHidden, setSlideHidden] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [hasCustomize, setHasCustomize] = useState(false)
  const [customizeContent, setCustomizeContent] = useState<string | undefined>('')
  const [generateWatermarkUnitFinish, setGenerateWatermarkUnitFinish] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [watermarkSize, setWatermarkSize] = useState({ width: 0})
  const watermarkUnitRef = useRef<HTMLDivElement>(null)
  const transformComponentRef = useRef<ReactZoomPanPinchRef | null>(null)
  const selectTransformRef = useRef<HTMLDivElement>(null)
  const uploadInputRef = useRef<HTMLInputElement>(null)
  const imageListRef = useRef<HTMLDivElement>(null)
  const messageRef = useRef<any>(null)
  const selectionRef = useRef<HTMLDivElement>(null)
  const leftMainRef = useRef<HTMLDivElement>(null)
  const waterCoverRef = useRef<HTMLDivElement>(null)
  const waterCoverImageRef = useRef<HTMLDivElement>(null)
  const pageWidth = useRef(0)
  const selectOutInitWidth = useRef(0)
  const devicePixelRatio = window.devicePixelRatio
  const waterUnitWidth = 222
  const waterUnitHeight = 168
  const offsetX = 138;

  const generateWatermarkUnit = useCallback(async () => {
    if (!watermarkUnitRef.current) return
    // 获取当前水印单元画布
    const watermarkCanvas = await getDomCanvas(watermarkUnitRef.current, devicePixelRatio)
    // 获取水印单元 base64 数据
    const watermarkUnitImageBase64 = watermarkCanvas.toDataURL()
    // setWatermarkUnit(watermarkUnitImageBase64)
    // 获取水印单元 buffer 数据
    watermarkCanvas.toBlob((blob) => {
      if (!blob) return
      const reader = new FileReader()
      reader.onload = async () => {
        if (!reader.result) return
        // setWatermarkBuffer(reader.result)
        setWatermarkUnit({
          base64Data: watermarkUnitImageBase64,
          bufferData: reader.result,
          nums: waterMarkValue.length
        })
        Message.success({
          content: "已应用水印内容",
        })
        setGenerateWatermarkUnitFinish(true)
      }
      reader.readAsArrayBuffer(blob)
    })
  }, [devicePixelRatio, waterMarkValue])

  const handleCheckboxChange = (value: string[]) => {
    if (value.length === 3) {
      value.shift()
    }
    setWaterMarkValue(value)
    setGenerateWatermarkUnitFinish(false)
  }

  const handleUpload = () => {
    if (uploadInputRef.current) {
      uploadInputRef.current.click()
    }
  }

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return
    setUploading(true)
    messageRef.current = Message.normal({
      content: "文件解析中，请耐心等待",
      duration: 0,
    })
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setFile(event.target?.result)
        setFileName(file.name)
      }
    };
    reader.readAsArrayBuffer(file);
  }
  const handleDownload = async () => {
    const pdfDoc = await PDFDocument.load(file);
    if (!watermarkUnit?.bufferData) return
    const watermarkImage = await pdfDoc.embedPng(watermarkUnit?.bufferData);
    for (let i = 0; i < pdfDoc.getPageCount(); i++) {
      if (selectedPages.includes(i)) {
        const page = pdfDoc.getPage(i);
        const { width, height } = page.getSize();

        // 计算水印图片的行数和列数，以便铺满整个页面
        const watermarkWidth = waterUnitWidth;
        const watermarkHeight = waterUnitHeight * waterMarkValue.length;
        const columns = Math.ceil(width / watermarkWidth);
        const rows = Math.ceil(height / watermarkHeight);

        // 在页面上重复绘制水印图片
        for (let row = 0; row < rows; row++) {
          for (let col = 0; col < columns; col++) {
            page.drawImage(watermarkImage, {
              blendMode: BlendMode.Exclusion,
              x: col * watermarkWidth,
              y: row * watermarkHeight,
              width: watermarkWidth,
              height: watermarkHeight,
            });
          }
        }
      }
    }
    const pdfWithWatermarkBytes = await pdfDoc.save({ useObjectStreams: true });
    const blob = new Blob([new Uint8Array(pdfWithWatermarkBytes)], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    const newName = fileName.replaceAll('.pdf', '')
    link.download = `${newName}_watermark.pdf`
    link.click();
    URL.revokeObjectURL(url);
  }

  const handleChangeSelectedPage = (value: number) => {
    const index = selectedPages.indexOf(value)

    if (index === -1) {
      selectedPages.push(value)
    } else {
      selectedPages.splice(index, 1)
    }
    setSelectedPages([...selectedPages])
  }

  const handleClearFile = () => {
    setFile('')
    setImageList([])
    setCurrentImage(0)
    setFileName('')
    setWatermarkSize({ width: 0 })
    transformComponentRef.current?.resetTransform()
    transformComponentRef.current?.centerView(0.8)
    if (uploadInputRef.current) {
      uploadInputRef.current.value = ''
    }
  }

  const handleWheel: React.WheelEventHandler<HTMLDivElement> = useCallback(throttle((event) => {
    const { deltaY } = event
    const max = imageList.length - 1
    const min = 0
    if (deltaY > 0) {
      const result = currentImage + 1
      if (result > max) return
      setCurrentImage(result)
    }
    if (deltaY < 0) {
      const result = currentImage - 1
      if (result < min) return
      setCurrentImage(result)
    }
  }, 250, { leading: false, trailing: true }), [currentImage, imageList])

  const handleTransform = () => {
    console.log('paki transform');
    if (selectTransformRef.current) {
      const { width } = selectTransformRef.current.getBoundingClientRect()
      selectOutInitWidth.current = width
    }
  }


  useEffect(() => {
    if (waterMarkValue.includes('customize')) {
      setHasCustomize(true)
    } else {
      setHasCustomize(false)
    }
  }, [waterMarkValue])

  useEffect(() => {
    const genetateImages = async () => {
      if (!file) return
      const fileCopy = file.slice(0)
      const pdfData = new Uint8Array((fileCopy as ArrayBufferLike));
      const pdf = await pdfjsLib.getDocument({ data: pdfData }).promise;
      const promises = Array.from(Array(pdf.numPages), (item, index) => index).map((item, itemIndex) => {
        return new Promise<ImageData>(async (resolve, reject) => {
          const page = await pdf.getPage(item + 1);
          const viewport = page.getViewport({ scale: 1 });
          const imageWidth = viewport.width
          const imageHeight = viewport.height
          if (itemIndex === 0) {
            pageWidth.current = imageWidth
          }
          const viewportScale = page.getViewport({ scale: devicePixelRatio })
          const canvas = document.createElement('canvas');
          canvas.className = `canvas_${itemIndex}`
          canvas.width = imageWidth * devicePixelRatio
          canvas.height = imageHeight * devicePixelRatio

          const ctx = canvas.getContext('2d');
          if (!ctx) return
          const renderContext = {
            canvasContext: ctx,
            viewport: viewportScale,
          };
          await page.render(renderContext).promise;
          canvas.style.width = `${imageWidth}px`
          canvas.style.height = `${imageHeight}px`
          resolve({
            width: imageWidth,
            height: imageHeight,
            canvas,
          })
        })
      })
      Promise.all(promises).then((value) => {
        if (messageRef.current) {
          messageRef.current.destroy()
        }
        setImageList(value)
        setUploading(false)
      }).catch((error) => {
        console.log(error)
        setUploading(false)
      })
    }
    const timer = setTimeout(() => {
      genetateImages()
    }, 300)

    return () => {
      clearTimeout(timer)
    }

  }, [file, devicePixelRatio])

  useEffect(() => {
    const pages = Array.from(Array(imageList.length), (item, index) => index)
    setCurrentImage(0)
    setSelectedPages(pages)

    // 页面插入 canvas 节点
    const imageDoms = document.getElementsByClassName('images_item')
    Array.from(imageDoms).forEach((item, index) => {
      const canvasDom = item.getElementsByClassName('canvas')[0]
      canvasDom.innerHTML = ''
      canvasDom.appendChild(imageList[index].canvas)
    })

    //设置背景的缩放倍数
    if (!leftMainRef.current || !pageWidth.current || imageList.length === 0) return
    const scale = waterUnitWidth / pageWidth.current
    setWatermarkSize({
      width: scale
    })

    transformComponentRef.current?.resetTransform()
    transformComponentRef.current?.centerView(0.7)


  }, [imageList])


  useEffect(() => {
    if (!imageListRef.current) return
    const children = imageListRef.current.querySelectorAll('.images_item')
    const target = children[currentImage]
    const { bottom: parentBottom, top: parentTop } = imageListRef.current.getBoundingClientRect()
    const { bottom: targetBottom, top: targetTop } = target.getBoundingClientRect()
    if (targetBottom > parentBottom || targetTop < parentTop) {
      target.scrollIntoView()
    }
  }, [currentImage])

  const checkboxContent = (
    <div>
      <Checkbox.Group value={waterMarkValue} onChange={handleCheckboxChange}>
        {
          Object.entries(waterMarkData).map((item) => {
            return <Checkbox style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }} value={item[1].key} key={item[1].key}><div className="checkbox_content">{item[1].desc}</div></Checkbox>
          })
        }
      </Checkbox.Group>
      {hasCustomize && (
        <div className="customize">
          <Input.Textarea
            style={{ height: '60px', width: '100%' }}
            onChange={(e, value) => {
              setCustomizeContent(value)
            }}
            limit={20}
            value={customizeContent}
            intent={(customizeContent !== undefined && customizeContent.length > 20) ? 'danger' : 'normal'}
          >
          </Input.Textarea>
        </div>
      )}
      <Button onClick={generateWatermarkUnit} size="medium" style={{ width: '100%', marginTop: '16px' }}>应用水印内容</Button>
    </div>
  )

  const exportDisabled = !watermarkUnit || !generateWatermarkUnitFinish || !file
  return (
    <div className="app">
      <div className="header">
        <Icon style={{ transform: 'rotate(180deg)', marginRight: '8px' }} icon="location-outlined" size={24} color="rgb(255, 255, 255)"></Icon>
        <div className="logo_text">TAD WaterMarks for PDF</div>
      </div>
      <div className="main">
        <div className="left">
          <div className={classNames('left_inner', { 'left_inner_active': !!imageList[currentImage] })}>
            {imageList.length > 0 && (
              <div style={{ width: slideHidden ? '0px' : '193px', overflowX: 'hidden', transition: 'all .4s ease-in-out' }}>
                <div className="images" ref={imageListRef}>
                  {imageList.map((item, index) => {
                    return <div className={classNames('images_item', { 'images_item_active': index === currentImage })} onClick={() => { setCurrentImage(index) }}>
                      {watermarkUnit && (
                        <div className="image_select" onClick={(event) => {
                          event.stopPropagation()
                          handleChangeSelectedPage(index)
                        }}>
                          <Checkbox size="large" checked={selectedPages.includes(index)}></Checkbox>
                        </div>
                      )}
                      <div className="images_item_inner" style={{ width: '100%', height: `${(160 / item.width) * item.height}px`, }}>
                        <div style={{ width: 'fit-content', transform: `scale(${160 / (item.width)})`, transformOrigin: 'left top', position: 'relative' }}>
                          <div className="canvas"></div>
                        </div>
                      </div>
                      <div className="image_num">{index + 1}</div>
                    </div>
                  })}
                </div>
              </div>
            )}
            <div ref={leftMainRef} className={classNames('left_main', { 'left_main_images': imageList.length > 0 })} onWheel={handleWheel}>
              {file && (
                <TransformWrapper onTransformed={handleTransform} ref={transformComponentRef} wheel={{ disabled: true }} centerOnInit centerZoomedOut minScale={0.2}>
                  {({ zoomIn, zoomOut }) => {
                    return <>
                      <TransformComponent wrapperStyle={{ width: '100%', height: '100%', overflow: 'hidden' }}>
                        <div className="selection_outer" ref={selectTransformRef}>
                          <div className="selection" ref={selectionRef}>
                            {imageList[currentImage] && <img style={{ width: '100%' }} alt='' src={imageList[currentImage].canvas.toDataURL()}></img>}
                          </div>
                          {selectedPages.includes(currentImage) && (
                            <div ref={waterCoverRef} className='watermark_cover'
                              style={{
                                backgroundImage: `url(${watermarkUnit?.base64Data})`,
                                backgroundRepeat: 'repeat',
                                backgroundPosition: '0px 0px',
                                backgroundSize: `${watermarkSize.width * 100}% auto`,
                                mixBlendMode: 'exclusion'
                              }}>
                            </div>
                          )}
                        </div>
                      </TransformComponent>
                      <div className="controls">
                        {imageList.length > 1 && <Pagination size="medium" total={imageList.length} pageSize={1} showButtonJumper showInputJumper current={currentImage + 1} onChange={(value) => { setCurrentImage(value - 1) }}></Pagination>}
                      </div>
                      <Button size="medium" leftIcon="material-layer" onClick={() => { setSlideHidden(!slideHidden) }} className='hidden_button'></Button>
                      <Button.Group size="medium" className="scale_buttons">
                        <Button leftIcon="minus" onClick={() => {
                          zoomOut(0.1);
                        }}></Button>
                        <Button leftIcon="add" onClick={() => {
                          zoomIn(0.1);
                        }}></Button>
                      </Button.Group>
                    </>
                  }}
                </TransformWrapper>
              )}
              {!file && (
                <div className="empty">
                  <input ref={uploadInputRef} className="button_input" accept=".pdf" type="file" onChange={handleFileChange} />
                  <Button leftIcon="upload" intent="primary" onClick={handleUpload}>上传 PDF 文件</Button>
                </div>
              )}
            </div>
          </div>
          <div className="watermark_unit" ref={watermarkUnitRef}>
            {
              waterMarkValue.map((item) => {
                if (item === 'customize') {
                  return (
                    <div className="watermark_item">
                      <div className="watermark_item_inner">{customizeContent}</div>
                    </div>
                  )
                } else {
                  return (
                    <div className="watermark_item">
                      <div className="watermark_item_inner">{waterMarkData[item].content}</div>
                    </div>
                  )
                }
              })
            }
          </div>
        </div>
        <div className="right">
          <div className="right_top">
            <div className="right_head">
              <div className="right_title">
                <div>PDF</div>
              </div>
              <div className="upload_button">
                {file && <input ref={uploadInputRef} className="button_input" accept=".pdf" type="file" onChange={handleFileChange} />}
                {!file && <div className="upload_button_empty">请先上传 PDF 文件</div>}
                {file && (
                  <div className="file_name_button">
                    <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                      <div className="file_name" style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, textAlign: 'left' }}>{fileName}</div>
                      <div className="file_name_operator">
                        <Button onClick={handleUpload} leftIcon="refresh" size="mini" theme="light"></Button>
                        <div style={{ width: '1px', margin: '0 6px', height: '16px', backgroundColor: 'var(--transparent-gray-300)', flex: 'none' }}></div>
                        <Button onClick={handleClearFile} leftIcon="delete-outlined" size="mini" theme="light"></Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="divider"></div>
            <div>
              <div className="right_title">
                <div className="right_title_inner">
                  <div>水印内容</div>
                  <div className="watermark_number" style={{ marginLeft: '8px' }}>{waterMarkValue.length}/2</div>
                </div>
              </div>
              <div className="right_checkbox">{checkboxContent}</div>
            </div>
          </div>
          <div className="right_bottom">
            {exportDisabled && <Popover popup="导出水印前，请先应用水印内容" placement="top"><div><Button intent="primary" onClick={handleDownload} loading={generating} disabled style={{ width: '100%' }}>导出文件</Button></div></Popover>}
            {!exportDisabled && <Button intent="primary" onClick={handleDownload} loading={generating} style={{ width: '100%' }}>导出文件</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;

