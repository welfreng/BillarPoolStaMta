param(
  [switch]$Execute,
  [string]$ProjectId = 'billarpoolstamta-5d4ac'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Get-FirebaseAccessToken {
  $paths = @(
    "$env:APPDATA\configstore\firebase-tools.json",
    "$env:LOCALAPPDATA\configstore\firebase-tools.json",
    "$env:USERPROFILE\.config\configstore\firebase-tools.json",
    "$env:USERPROFILE\.firebase\firebase-tools.json"
  )

  $cfgPath = $paths | Where-Object { Test-Path $_ } | Select-Object -First 1
  if (-not $cfgPath) {
    throw 'No firebase-tools.json was found. Run firebase login first.'
  }

  $cfg = Get-Content $cfgPath | ConvertFrom-Json
  if (-not $cfg.tokens.access_token) {
    throw 'No access_token found in firebase-tools config.'
  }

  return $cfg.tokens.access_token
}

function Get-FirestoreBaseUrl([string]$ProjectId) {
  return "https://firestore.googleapis.com/v1/projects/$ProjectId/databases/(default)/documents"
}

function Get-FieldObject($fields, [string]$name) {
  if ($null -eq $fields) { return $null }
  if ($fields -is [hashtable]) {
    if ($fields.ContainsKey($name)) { return $fields[$name] }
    return $null
  }
  $prop = $fields.PSObject.Properties[$name]
  if ($null -ne $prop) { return $prop.Value }
  return $null
}

function Get-FieldString($fields, [string]$name) {
  $field = Get-FieldObject $fields $name
  if ($null -eq $field) { return '' }
  $prop = $field.PSObject.Properties['stringValue']
  if ($null -ne $prop -and $null -ne $prop.Value) { return [string]$prop.Value }
  return ''
}

function Set-MapField($mapFields, [string]$fieldName, $fieldValue) {
  if ($mapFields -is [hashtable]) {
    $mapFields[$fieldName] = $fieldValue
    return
  }

  $existing = $mapFields.PSObject.Properties[$fieldName]
  if ($null -ne $existing) {
    $existing.Value = $fieldValue
  } else {
    $mapFields | Add-Member -NotePropertyName $fieldName -NotePropertyValue $fieldValue -Force
  }
}

function Get-FirestoreDocuments {
  param(
    [string]$Collection,
    [hashtable]$Headers,
    [string]$BaseUrl
  )

  $all = New-Object System.Collections.Generic.List[object]
  $pageToken = $null

  do {
    $uri = "$BaseUrl/${Collection}?pageSize=200"
    if ($pageToken) {
      $uri = "$uri&pageToken=$pageToken"
    }

    $response = Invoke-RestMethod -Uri $uri -Headers $Headers -Method Get
    $documentsProp = $response.PSObject.Properties['documents']
    $pageDocs = if ($null -ne $documentsProp) { @($documentsProp.Value) } else { @() }
    foreach ($doc in $pageDocs) {
      $all.Add($doc)
    }

    $nextTokenProp = $response.PSObject.Properties['nextPageToken']
    $pageToken = if ($null -ne $nextTokenProp) { [string]$nextTokenProp.Value } else { $null }
  } while ($pageToken)

  return @($all.ToArray())
}

function Delete-FirestoreDocument {
  param(
    [string]$DocumentName,
    [hashtable]$Headers
  )

  $uri = "https://firestore.googleapis.com/v1/$DocumentName"
  Invoke-RestMethod -Uri $uri -Headers $Headers -Method Delete | Out-Null
}

function Patch-FirestoreDocument {
  param(
    [string]$DocumentName,
    [string[]]$FieldPaths,
    [hashtable]$Fields,
    [hashtable]$Headers
  )

  $query = ($FieldPaths | ForEach-Object {
      'updateMask.fieldPaths=' + [uri]::EscapeDataString($_)
    }) -join '&'

  $uri = "https://firestore.googleapis.com/v1/${DocumentName}?$query"
  $body = @{ fields = $Fields } | ConvertTo-Json -Depth 100

  Invoke-RestMethod -Uri $uri -Headers $Headers -Method Patch -ContentType 'application/json' -Body $body | Out-Null
}

function Reset-EmbeddedVariants($productDoc) {
  $productFields = $productDoc.fields
  $variantsField = Get-FieldObject $productFields 'variants'
  if ($null -eq $variantsField) { return $null }

  $arrayValue = $variantsField.arrayValue
  if ($null -eq $arrayValue) { return $variantsField }

  $valuesProp = $arrayValue.PSObject.Properties['values']
  if ($null -eq $valuesProp) { return $variantsField }
  $variantValues = @($valuesProp.Value)
  if ($variantValues.Count -eq 0) { return $variantsField }

  foreach ($variantValue in $variantValues) {
    if ($null -eq $variantValue.mapValue -or $null -eq $variantValue.mapValue.fields) {
      continue
    }

    $variantFields = $variantValue.mapValue.fields
    Set-MapField $variantFields 'stock' @{ integerValue = '0' }
    Set-MapField $variantFields 'publicStock' @{ integerValue = '0' }
    Set-MapField $variantFields 'latestUnitCost' @{ doubleValue = 0 }
  }

  return @{ arrayValue = @{ values = $variantValues } }
}

function Build-CollectionCounts($docsByCollection) {
  $counts = [ordered]@{}
  foreach ($key in $docsByCollection.Keys) {
    $counts[$key] = @($docsByCollection[$key]).Count
  }
  return $counts
}

$token = Get-FirebaseAccessToken
$headers = @{ Authorization = "Bearer $token" }
$baseUrl = Get-FirestoreBaseUrl -ProjectId $ProjectId
$now = Get-Date
$stamp = $now.ToString('yyyyMMdd-HHmmss')

$operationalCollections = @(
  'purchases',
  'purchase_items',
  'sales',
  'services',
  'movements',
  'inventory_movements',
  'authorization-requests',
  'admin-notifications',
  'service-visits'
)

$docsByCollection = [ordered]@{}
$docsByCollection['products'] = Get-FirestoreDocuments -Collection 'products' -Headers $headers -BaseUrl $baseUrl
$docsByCollection['product_variants'] = Get-FirestoreDocuments -Collection 'product_variants' -Headers $headers -BaseUrl $baseUrl
$docsByCollection['usuarios'] = Get-FirestoreDocuments -Collection 'usuarios' -Headers $headers -BaseUrl $baseUrl
foreach ($collection in $operationalCollections) {
  $docsByCollection[$collection] = Get-FirestoreDocuments -Collection $collection -Headers $headers -BaseUrl $baseUrl
}

$targetProductNames = @('prueba 2', 'producto prueba')
$targetProducts = @($docsByCollection['products'] | Where-Object {
    $name = Get-FieldString $_.fields 'name'
    $targetProductNames -contains $name
  })
$targetProductIds = @($targetProducts | ForEach-Object { ($_.name -split '/')[-1] })

$targetProductVariants = @($docsByCollection['product_variants'] | Where-Object {
    $variantProductId = Get-FieldString $_.fields 'productId'
    $targetProductIds -contains $variantProductId
  })

$remainingProducts = @($docsByCollection['products'] | Where-Object {
    $id = ($_.name -split '/')[-1]
    -not ($targetProductIds -contains $id)
  })

$remainingProductVariants = @($docsByCollection['product_variants'] | Where-Object {
    $variantProductId = Get-FieldString $_.fields 'productId'
    -not ($targetProductIds -contains $variantProductId)
  })

$preCounts = Build-CollectionCounts -docsByCollection $docsByCollection

$backup = [ordered]@{
  exportedAt = $now.ToString('o')
  projectId = $ProjectId
  executeMode = [bool]$Execute
  targetProductNames = $targetProductNames
  targetProductsFound = @($targetProducts | ForEach-Object {
      [ordered]@{
        id = ($_.name -split '/')[-1]
        name = Get-FieldString $_.fields 'name'
      }
    })
  preCounts = $preCounts
  data = [ordered]@{
    products = $docsByCollection['products']
    product_variants = $docsByCollection['product_variants']
    usuarios = $docsByCollection['usuarios']
    purchases = $docsByCollection['purchases']
    purchase_items = $docsByCollection['purchase_items']
    sales = $docsByCollection['sales']
    services = $docsByCollection['services']
    movements = $docsByCollection['movements']
    inventory_movements = $docsByCollection['inventory_movements']
    authorization_requests = $docsByCollection['authorization-requests']
    admin_notifications = $docsByCollection['admin-notifications']
    service_visits = $docsByCollection['service-visits']
  }
}

$backupPath = Join-Path (Get-Location) "cleanup-logs/cleanup-backup-$stamp.json"
$backup | ConvertTo-Json -Depth 100 | Set-Content -Path $backupPath -Encoding UTF8

$actionSummary = [ordered]@{
  deleted = [ordered]@{}
  updated = [ordered]@{
    products = 0
    product_variants = 0
  }
}

foreach ($collection in $operationalCollections) {
  $actionSummary.deleted[$collection] = 0
}
$actionSummary.deleted['target_product_variants'] = 0
$actionSummary.deleted['target_products'] = 0

if ($Execute) {
  foreach ($collection in $operationalCollections) {
    foreach ($doc in @($docsByCollection[$collection])) {
      Delete-FirestoreDocument -DocumentName $doc.name -Headers $headers
      $actionSummary.deleted[$collection] = [int]$actionSummary.deleted[$collection] + 1
    }
  }

  foreach ($doc in $targetProductVariants) {
    Delete-FirestoreDocument -DocumentName $doc.name -Headers $headers
    $actionSummary.deleted['target_product_variants'] = [int]$actionSummary.deleted['target_product_variants'] + 1
  }

  foreach ($doc in $targetProducts) {
    Delete-FirestoreDocument -DocumentName $doc.name -Headers $headers
    $actionSummary.deleted['target_products'] = [int]$actionSummary.deleted['target_products'] + 1
  }

  foreach ($productDoc in $remainingProducts) {
    $fieldsToPatch = @('publicStock')
    $patchFields = [ordered]@{
      publicStock = @{ integerValue = '0' }
    }

    $normalizedVariants = Reset-EmbeddedVariants -productDoc $productDoc
    if ($null -ne $normalizedVariants) {
      $fieldsToPatch += 'variants'
      $patchFields['variants'] = $normalizedVariants
    }

    Patch-FirestoreDocument -DocumentName $productDoc.name -FieldPaths $fieldsToPatch -Fields $patchFields -Headers $headers
    $actionSummary.updated.products = [int]$actionSummary.updated.products + 1
  }

  foreach ($variantDoc in $remainingProductVariants) {
    $variantFields = [ordered]@{
      stock = @{ integerValue = '0' }
      publicStock = @{ integerValue = '0' }
      latestUnitCost = @{ doubleValue = 0 }
    }

    $existingStockOnHand = Get-FieldObject $variantDoc.fields 'stockOnHand'
    $fieldPaths = @('stock', 'publicStock', 'latestUnitCost')
    if ($null -ne $existingStockOnHand) {
      $variantFields['stockOnHand'] = @{ integerValue = '0' }
      $fieldPaths += 'stockOnHand'
    }

    Patch-FirestoreDocument -DocumentName $variantDoc.name -FieldPaths $fieldPaths -Fields $variantFields -Headers $headers
    $actionSummary.updated.product_variants = [int]$actionSummary.updated.product_variants + 1
  }
}

$postCollections = [ordered]@{}
$postCollections['products'] = Get-FirestoreDocuments -Collection 'products' -Headers $headers -BaseUrl $baseUrl
$postCollections['product_variants'] = Get-FirestoreDocuments -Collection 'product_variants' -Headers $headers -BaseUrl $baseUrl
$postCollections['usuarios'] = Get-FirestoreDocuments -Collection 'usuarios' -Headers $headers -BaseUrl $baseUrl
foreach ($collection in $operationalCollections) {
  $postCollections[$collection] = Get-FirestoreDocuments -Collection $collection -Headers $headers -BaseUrl $baseUrl
}

$postCounts = Build-CollectionCounts -docsByCollection $postCollections
$postProductNames = @($postCollections['products'] | ForEach-Object { Get-FieldString $_.fields 'name' })
$postUserIds = @($postCollections['usuarios'] | ForEach-Object { ($_.name -split '/')[-1] })

$targetNameChecks = [ordered]@{}
foreach ($name in $targetProductNames) {
  $targetNameChecks[$name] = -not ($postProductNames -contains $name)
}

$variantDocsZeroed = @($postCollections['product_variants'] | Where-Object {
    $stockField = Get-FieldObject $_.fields 'stock'
    $publicStockField = Get-FieldObject $_.fields 'publicStock'
    $costField = Get-FieldObject $_.fields 'latestUnitCost'

    $stockIsZero = ($null -ne $stockField) -and (
      (($stockField.PSObject.Properties['integerValue'] -and [int64]$stockField.integerValue -eq 0) -or
       ($stockField.PSObject.Properties['doubleValue'] -and [double]$stockField.doubleValue -eq 0.0))
    )

    $publicStockIsZero = ($null -ne $publicStockField) -and (
      (($publicStockField.PSObject.Properties['integerValue'] -and [int64]$publicStockField.integerValue -eq 0) -or
       ($publicStockField.PSObject.Properties['doubleValue'] -and [double]$publicStockField.doubleValue -eq 0.0))
    )

    $costIsZeroOrMissing = ($null -eq $costField) -or (
      ($costField.PSObject.Properties['integerValue'] -and [int64]$costField.integerValue -eq 0) -or
      ($costField.PSObject.Properties['doubleValue'] -and [double]$costField.doubleValue -eq 0.0)
    )

    $stockIsZero -and $publicStockIsZero -and $costIsZeroOrMissing
  }).Count

$embeddedVariantChecks = @($postCollections['products'] | ForEach-Object {
    $variantsField = Get-FieldObject $_.fields 'variants'
    if ($null -eq $variantsField -or $null -eq $variantsField.arrayValue) { return $true }
    $arrayValueObject = $variantsField.arrayValue
    $valuesProp = $arrayValueObject.PSObject.Properties['values']
    if ($null -eq $valuesProp) { return $true }

    foreach ($variantValue in @($valuesProp.Value)) {
      if ($null -eq $variantValue.mapValue -or $null -eq $variantValue.mapValue.fields) { continue }
      $vf = $variantValue.mapValue.fields
      $stockField = Get-FieldObject $vf 'stock'
      $publicStockField = Get-FieldObject $vf 'publicStock'
      $costField = Get-FieldObject $vf 'latestUnitCost'

      $stockZero = ($null -ne $stockField) -and (
        ($stockField.PSObject.Properties['integerValue'] -and [int64]$stockField.integerValue -eq 0) -or
        ($stockField.PSObject.Properties['doubleValue'] -and [double]$stockField.doubleValue -eq 0.0)
      )

      $publicStockZero = ($null -ne $publicStockField) -and (
        ($publicStockField.PSObject.Properties['integerValue'] -and [int64]$publicStockField.integerValue -eq 0) -or
        ($publicStockField.PSObject.Properties['doubleValue'] -and [double]$publicStockField.doubleValue -eq 0.0)
      )

      $costZeroOrMissing = ($null -eq $costField) -or (
        ($costField.PSObject.Properties['integerValue'] -and [int64]$costField.integerValue -eq 0) -or
        ($costField.PSObject.Properties['doubleValue'] -and [double]$costField.doubleValue -eq 0.0)
      )

      if (-not ($stockZero -and $publicStockZero -and $costZeroOrMissing)) {
        return $false
      }
    }

    return $true
  } | Where-Object { $_ -eq $true }).Count

$result = [ordered]@{
  executedAt = (Get-Date).ToString('o')
  executeMode = [bool]$Execute
  backupPath = $backupPath
  preCounts = $preCounts
  actions = $actionSummary
  postCounts = $postCounts
  validations = [ordered]@{
    usersPreservedCount = ($postCounts['usuarios'] -eq $preCounts['usuarios'])
    usersPreservedIds = $postUserIds
    targetProductsRemoved = $targetNameChecks
    purchasesZero = ($postCounts['purchases'] -eq 0)
    purchaseItemsZero = ($postCounts['purchase_items'] -eq 0)
    salesZero = ($postCounts['sales'] -eq 0)
    servicesZero = ($postCounts['services'] -eq 0)
    movementsZero = ($postCounts['movements'] -eq 0)
    inventoryMovementsZero = ($postCounts['inventory_movements'] -eq 0)
    authorizationRequestsZero = ($postCounts['authorization-requests'] -eq 0)
    adminNotificationsZero = ($postCounts['admin-notifications'] -eq 0)
    serviceVisitsZero = ($postCounts['service-visits'] -eq 0)
    allProductPublicStockZero = (@($postCollections['products'] | Where-Object {
      $publicStockField = Get-FieldObject $_.fields 'publicStock'
      if ($null -eq $publicStockField) { return $false }
      return (
        ($publicStockField.PSObject.Properties['integerValue'] -and [int64]$publicStockField.integerValue -eq 0) -or
        ($publicStockField.PSObject.Properties['doubleValue'] -and [double]$publicStockField.doubleValue -eq 0.0)
      )
    }).Count -eq $postCounts['products'])
    allVariantDocsZeroed = ($variantDocsZeroed -eq $postCounts['product_variants'])
    allEmbeddedVariantsZeroed = ($embeddedVariantChecks -eq $postCounts['products'])
  }
}

$resultPath = Join-Path (Get-Location) "cleanup-logs/cleanup-result-$stamp.json"
$result | ConvertTo-Json -Depth 100 | Set-Content -Path $resultPath -Encoding UTF8

Write-Output ("RESULT_FILE=" + $resultPath)
Write-Output ("BACKUP_FILE=" + $backupPath)
Write-Output ("EXECUTE_MODE=" + [bool]$Execute)
Write-Output ("PRE_COUNTS=" + ($preCounts | ConvertTo-Json -Compress))
Write-Output ("POST_COUNTS=" + ($postCounts | ConvertTo-Json -Compress))
Write-Output ("VALIDATIONS=" + ($result.validations | ConvertTo-Json -Compress))
