import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { bitable } from '@lark-base-open/js-sdk'
import { Card, Modal, Checkbox, message } from 'antd'

// 选项类型定义
interface OptionGroup {
  title: string
  options: string[]
  required: boolean
  level?: number
  parentOption?: string
  condition?: (checkedList: string[]) => boolean
  resetOn?: string[] // 当这些选项被选中时，重置该组的选项
}

// 选项分组配置
const OPTION_GROUPS: OptionGroup[] = [
  {
    title: '单据类型',
    options: ['首单', '翻单'],
    required: true,
    level: 1
  },
  {
    title: '是否要打板',
    options: ['需要打板', '不需要打板'],
    required: false,
    level: 2,
    parentOption: '首单',
    condition: (checkedList) => checkedList.includes('首单'),
    resetOn: ['翻单']
  },
  {
    title: '翻单变动',
    options: ['无变动不需要修改', '有变动需要修改'],
    required: false,
    level: 2,
    parentOption: '翻单',
    condition: (checkedList) => checkedList.includes('翻单'),
    resetOn: ['首单']
  },
  {
    title: '特殊订单',
    options: ['换料寄面料样', '换料重新打板', '加色', '改尺寸不打版', '改尺寸重新打板'],
    required: false,
    level: 3,
    parentOption: '有变动需要修改',
    condition: (checkedList) => checkedList.includes('有变动需要修改'),
    resetOn: ['首单', '无变动不需要修改']
  },
  {
    title: '批色样',
    options: ['要批色样', '不要批色样'],
    required: true,
    level: 4,
    parentOption: '加色',
    condition: (checkedList) => checkedList.includes('加色'),
    resetOn: ['首单', '无变动不需要修改', '需要打板', '不需要打板']
  },
  {
    title: '批色样',
    options: ['要批色样', '不要批色样'],
    required: true,
    level: 3,
    parentOption: '不需要打板',
    condition: (checkedList) => checkedList.includes('首单') && checkedList.includes('不需要打板'),
    resetOn: ['翻单', '有变动需要修改', '无变动不需要修改']
  },
  {
    title: '品类',
    options: ['牛仔', '时装'],
    required: true
  },
  {
    title: '复杂度',
    options: ['简单款', '基础款', '复杂款'],
    required: true
  },
  {
    title: '产能',
    options: ['有产能', '没产能'],
    required: true
  },
  {
    title: '二次工艺',
    options: ['绣花', '印花'],
    required: false
  }
]

// 面料测试选项
const FABRIC_TEST_OPTIONS = ['需要面料测试', '不需要面料测试']

// 选项组件
interface OptionGroupProps {
  group: OptionGroup
  checkedList: string[]
  onChange: (newList: string[]) => void
  lockedOptions?: string[]
  level?: number
}

const OptionGroup: React.FC<OptionGroupProps> = ({ 
  group, 
  checkedList, 
  onChange, 
  lockedOptions = [],
  level = 1
}) => {
  const isMulti = group.title === '二次工艺'
  const groupChecked = checkedList.filter(v => group.options.includes(v))
  
  // 缩进样式
  const indentStyle = {
    marginLeft: level > 1 ? (level - 1) * 24 : 0,
    marginTop: level > 1 ? 8 : 0,
    borderLeft: level > 1 ? `${level > 2 ? 'dashed' : 'solid'} 2px #eee` : 'none',
    paddingLeft: level > 1 ? 12 : 0
  }
  
  // 标题颜色
  const titleColor = level === 1 ? '#000' : 
                    level === 2 ? '#888' : 
                    level === 3 ? '#b36d00' : '#888'
  
  return (
    <div key={group.title} style={{ ...indentStyle, marginBottom: 12 }}>
      <div style={{ fontWeight: 'bold', marginBottom: 4, color: titleColor }}>
        {group.title}
        {group.required && <span style={{ color: 'red', marginLeft: 4 }}>*</span>}
      </div>
      <Checkbox.Group
        options={group.options.map(opt => ({
          label: opt,
          value: opt,
          disabled: lockedOptions.includes(opt)
        }))}
        value={groupChecked}
        onChange={list => {
          const others = checkedList.filter(v => !group.options.includes(v))
          let newList
          if (isMulti) {
            newList = [...others, ...(list as string[])]
          } else {
            newList = [...others, (list as string[]).slice(-1)[0]].filter(Boolean)
          }
          onChange(newList)
        }}
      />
    </div>
  )
}

// 订单配置选择器组件
interface OrderConfigSelectorProps {
  selectedRecordId: string | null
  checkedList: string[]
  setCheckedList: (list: string[]) => void
  onSubmit: (options: string[]) => void
  onCancel: () => void
  loading: boolean
}

const OrderConfigSelector: React.FC<OrderConfigSelectorProps> = ({
  selectedRecordId,
  checkedList,
  setCheckedList,
  onSubmit,
  onCancel,
  loading
}) => {
  // 处理选项变更
  const handleCheckedListChange = (newList: string[]) => {
    // 找出新增的选项
    const addedOptions = newList.filter(opt => !checkedList.includes(opt))
    
    // 如果新增了需要重置其他选项的选项
    if (addedOptions.length > 0) {
      let shouldReset = false
      let resetGroups: OptionGroup[] = []
      
      // 检查每个选项组是否需要重置
      OPTION_GROUPS.forEach(group => {
        if (group.resetOn && group.resetOn.some(resetOpt => addedOptions.includes(resetOpt))) {
          resetGroups.push(group)
          shouldReset = true
        }
      })
      
      if (shouldReset) {
        // 重置需要重置的选项组的选项
        const filteredOptions = newList.filter(opt => {
          const group = OPTION_GROUPS.find(g => g.options.includes(opt))
          return !resetGroups.includes(group as OptionGroup)
        })
        
        setCheckedList(filteredOptions)
        return
      }
    }
    
    setCheckedList(newList)
  }
  
  // 检查是否满足所有必填项
  const validateRequired = () => {
    for (const group of OPTION_GROUPS) {
      if (group.required && group.condition?.(checkedList) !== false) {
        const has = checkedList.some(v => group.options.includes(v))
        if (!has) {
          message.error(`请至少选择一项【${group.title}】`)
          return false
        }
      }
    }
    
    // 特殊验证：如果选择了"不需要打板"，必须选择是否批色样
    if (checkedList.includes('首单') && checkedList.includes('不需要打板')) {
      const hasColorSample = checkedList.some(v => v === '要批色样' || v === '不要批色样')
      if (!hasColorSample) {
        message.error('请选择是否要批色样')
        return false
      }
    }
    
    return true
  }
  
  // 检查是否需要弹出面料测试确认框
  const needFabricTestDialog = () => {
    // 只有当选择了"翻单"且"无变动不需要修改"时，不需要弹出确认框
    return !(checkedList.includes('翻单') && checkedList.includes('无变动不需要修改'))
  }
  
  // 状态管理
  const [showFabricTestModal, setShowFabricTestModal] = useState(false)
  const [fabricTestSelection, setFabricTestSelection] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [finalOptions, setFinalOptions] = useState<string[]>([])
  
  // 提交表单
  const handleSubmit = () => {
    if (!validateRequired()) return
    
    // 保存当前选择的所有选项
    setFinalOptions([...checkedList])
    
    // 根据条件决定是直接提交还是先弹出面料测试确认框
    if (needFabricTestDialog()) {
      // 重置面料测试选择状态
      setFabricTestSelection([])
      // 显示面料测试对话框
      setShowFabricTestModal(true)
    } else {
      // 直接提交
      onSubmit([...checkedList])
    }
  }
  
  // 处理面料测试对话框的提交
  const handleFabricTestSubmit = () => {
    if (fabricTestSelection.length === 0) {
      message.error('请选择是否需要面料测试')
      return
    }
    
    setIsSubmitting(true)
    
    // 将面料测试选项与原始选项合并后提交
    onSubmit([...finalOptions, ...fabricTestSelection])
    
    // 关闭对话框
    setShowFabricTestModal(false)
  }
  
  // 监听面料测试对话框关闭事件
  useEffect(() => {
    if (!showFabricTestModal && isSubmitting) {
      setIsSubmitting(false)
    }
  }, [showFabricTestModal, isSubmitting])
  
  return (
    <>
      <Modal
        title="订单配置"
        open={!!selectedRecordId}
        onOk={handleSubmit}
        onCancel={() => {
          onCancel();
          setCheckedList([]); // 取消时重置选项
        }}
        okText="确定"
        cancelText="取消"
        confirmLoading={loading}
      >
        {OPTION_GROUPS.map(group => (
          group.condition?.(checkedList) !== false && (
            <OptionGroup 
              key={group.title}
              group={group}
              checkedList={checkedList}
              onChange={handleCheckedListChange}
              level={group.level}
            />
          )
        ))}
      </Modal>
      
      {/* 面料测试对话框 */}
      <Modal
        title="面料测试"
        open={showFabricTestModal}
        onOk={handleFabricTestSubmit}
        onCancel={() => setShowFabricTestModal(false)}
        okText="确定"
        cancelText="取消"
        confirmLoading={isSubmitting}
      >
        <div>
          <p>请选择是否需要面料测试：</p>
          <Checkbox.Group
            options={FABRIC_TEST_OPTIONS}
            value={fabricTestSelection}
            onChange={(values) => {
              // 确保单选逻辑：每次只保留最后一个选择的值
              if (values.length > 0) {
                setFabricTestSelection([values[values.length - 1]])
              } else {
                setFabricTestSelection([])
              }
            }}
          />
        </div>
      </Modal>
    </>
  )
}

// 主应用组件
const LoadApp: React.FC = () => {
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null)
  const [checkedList, setCheckedList] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [currentSelection, setCurrentSelection] = useState<{
    tableId: string | null,
    recordId: string | null
  }>({ tableId: null, recordId: null })
  
  // 重置所有选项
  const resetOptions = () => {
    setSelectedRecordId(null);
    setCheckedList([]); // 重置选项列表
  }
  
  useEffect(() => {
    // 监听选中变化事件
    const unsubscribe = bitable.base.onSelectionChange(async (event: any) => {
      try {
        const { data } = event
        if (data && data.tableId && data.recordId) {
          // 检查是否是新的单元格
          const isNewCell = (
            data.tableId !== currentSelection.tableId || 
            data.recordId !== currentSelection.recordId
          )
          
          // 如果是新单元格，重置选项
          if (isNewCell) {
            resetOptions();
            setCurrentSelection({
              tableId: data.tableId,
              recordId: data.recordId
            });
          }
          
          const table = await bitable.base.getTableById(data.tableId)
          const cellValue = await table.getCellValue('fldTtRHwlo', data.recordId)
          setSelectedRecordId(data.recordId)
          
          // 如果单元格有值，加载到checkedList
          if (Array.isArray(cellValue)) {
            setCheckedList(cellValue);
          }
        }
      } catch (e) {
        message.error('获取选中记录失败')
      }
    })
    return () => {
      unsubscribe()
    }
  }, [currentSelection])
  
  // 保存选项到表格
  const saveOptions = async (options: string[]) => {
    if (!selectedRecordId) return
    
    try {
      setLoading(true)
      const table = await bitable.base.getActiveTable()
      if (!table) return
      
      const field = await table.getFieldById('fldTtRHwlo')
      
      // 调试：打印保存的选项
      console.log('Saving options:', options)
      console.log('Field type:', await field.getType())
      
      // 确保所有选项都被保存
      await field.setValue(
        selectedRecordId, 
        options.length > 0 ? options : null
      )
      
      // 验证保存结果
      const savedValue = await field.getValue(selectedRecordId)
      console.log('Saved value:', savedValue)
      
      message.success('已保存选项')
    } catch (e) {
      console.error('保存失败', e)
      message.error('保存失败：' + (e && e.message ? e.message : '未知错误'))
    } finally {
      setLoading(false)
      resetOptions(); // 保存后重置所有选项
      setCurrentSelection({ tableId: null, recordId: null })
    }
  }
  
  return (
    <div style={{ padding: '16px' }}>
      <Card>
        <div>请先点击一个单元格数据</div>
      </Card>
      
      <OrderConfigSelector
        selectedRecordId={selectedRecordId}
        checkedList={checkedList}
        setCheckedList={setCheckedList}
        onSubmit={saveOptions}
        onCancel={resetOptions}
        loading={loading}
      />
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <LoadApp />
  </React.StrictMode>
)
